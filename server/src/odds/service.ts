import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { OpenF1Client } from '../openf1/client.js';
import type { DriverInfo, SessionInfo } from '../types.js';
import { JsonFetcher } from './http.js';
import { findKalshiMarket } from './kalshi.js';
import { findPolymarketMarket } from './polymarket.js';
import type { MeetingInfo, OddsBoard, OddsMarket } from './types.js';

/** Odds history starts this long before the session, so the chart has a pre-race baseline. */
export const PRE_SESSION_MS = 30 * 60_000;

export interface OddsLoad {
  board: OddsBoard | null;
  market: OddsMarket | null;
  /** Why there is no board, in words for the page. */
  note?: string;
}

/**
 * Finds the race-winner market for a race weekend (Kalshi first, Polymarket as backup) and loads
 * each driver's price history. Read-only market data: nothing here can place a trade.
 */
export class OddsService {
  readonly http: JsonFetcher;

  constructor(
    private readonly openf1: OpenF1Client,
    private readonly cacheDir: string | null,
    fetchImpl: typeof fetch = fetch,
    private readonly finders: ((m: MeetingInfo, d: DriverInfo[]) => Promise<OddsMarket | null>)[] | null = null,
  ) {
    this.http = new JsonFetcher(fetchImpl);
  }

  async load(session: SessionInfo, drivers: DriverInfo[], from: number, to: number): Promise<OddsLoad> {
    const cachePath = this.cacheDir ? join(this.cacheDir, 'odds', `${session.session_key}.json`) : null;
    const finished = to < Date.now() - 3600_000;
    if (cachePath && finished) {
      const cached = await readJson<OddsBoard>(cachePath);
      if (cached) return { board: cached, market: null };
    }

    const meeting = await this.meetingInfo(session);
    const finders = this.finders ?? [(m: MeetingInfo, d: DriverInfo[]) => findKalshiMarket(this.http, m, d), (m: MeetingInfo, d: DriverInfo[]) => findPolymarketMarket(this.http, m, d)];
    let market: OddsMarket | null = null;
    const errors: string[] = [];
    for (const find of finders) {
      try {
        market = await find(meeting, drivers);
      } catch (err) {
        errors.push((err as Error).message);
      }
      if (market) break;
    }
    if (!market) {
      return { board: null, market: null, note: errors.length ? `Odds unavailable: ${errors[0]}` : `No race-winner market found for the ${meeting.name}` };
    }

    const series: OddsBoard['series'] = {};
    for (const [driver, id] of market.markets) {
      try {
        series[driver] = await market.history(id, from, to);
      } catch {
        series[driver] = [];
      }
    }
    const board: OddsBoard = { source: market.source, title: market.title, url: market.url, series };
    const hasData = Object.values(series).some((s) => s.length > 0);
    if (cachePath && finished && hasData) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify(board));
    }
    return { board, market };
  }

  /** Current price per driver_number. */
  async poll(market: OddsMarket): Promise<Record<string, number>> {
    const prices = await market.current();
    const out: Record<string, number> = {};
    for (const [driver, id] of market.markets) {
      const p = prices.get(id);
      if (p !== undefined) out[driver] = p;
    }
    return out;
  }

  private async meetingInfo(session: SessionInfo): Promise<MeetingInfo> {
    let name = `${session.location} Grand Prix`;
    let raceStart: number | null = session.session_name === 'Race' ? Date.parse(session.date_start) : null;
    try {
      const meetings = await this.openf1.get<{ meeting_name?: string }[]>('meetings', { meeting_key: session.meeting_key });
      if (meetings[0]?.meeting_name) name = meetings[0].meeting_name;
      if (raceStart === null) {
        const races = await this.openf1.get<{ date_start: string }[]>('sessions', { meeting_key: session.meeting_key, session_name: 'Race' });
        if (races[0]) raceStart = Date.parse(races[0].date_start);
      }
    } catch {
      /* fall back to the location name */
    }
    return { name, year: session.year, raceStart };
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
