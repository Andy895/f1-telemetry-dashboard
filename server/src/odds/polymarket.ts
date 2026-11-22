import type { DriverInfo } from '../types.js';
import type { JsonFetcher } from './http.js';
import { matchDriver, meetingKeys, normalize, titleMatches } from './match.js';
import type { MeetingInfo, OddsMarket, OddsPoint } from './types.js';

export const POLYMARKET_GAMMA = 'https://gamma-api.polymarket.com';
export const POLYMARKET_CLOB = 'https://clob.polymarket.com';

interface PolyMarket {
  groupItemTitle?: string;
  clobTokenIds?: string;
  outcomes?: string;
  outcomePrices?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  lastTradePrice?: number | null;
}

interface PolyEvent {
  slug: string;
  title: string;
  markets?: PolyMarket[];
}

/**
 * Polymarket's "<Grand Prix>: Driver Winner" events. Used when Kalshi has no market for the race.
 * Event slugs look like f1-qatar-grand-prix-winner-2026-11-29 (the race's local date).
 */
export async function findPolymarketMarket(
  http: JsonFetcher,
  meeting: MeetingInfo,
  drivers: DriverInfo[],
  urls = { gamma: POLYMARKET_GAMMA, clob: POLYMARKET_CLOB },
): Promise<OddsMarket | null> {
  const event = await findEvent(http, meeting, urls.gamma);
  if (!event) return null;

  const tokenOf = (m: PolyMarket): string | null => {
    const ids = parseList(m.clobTokenIds);
    const outcomes = parseList(m.outcomes);
    const yes = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
    return ids[yes >= 0 ? yes : 0] ?? null;
  };
  const byDriver = new Map<number, string>();
  for (const m of event.markets ?? []) {
    const token = tokenOf(m);
    const n = matchDriver(m.groupItemTitle ?? '', drivers);
    if (token && n !== null && !byDriver.has(n)) byDriver.set(n, token);
  }
  if (byDriver.size === 0) return null;

  return {
    source: 'polymarket',
    title: event.title,
    url: `https://polymarket.com/event/${event.slug}`,
    markets: byDriver,
    async history(token, from, to) {
      const q = `market=${token}&startTs=${Math.floor(from / 1000)}&endTs=${Math.ceil(to / 1000)}&fidelity=1`;
      const res = await http.get<{ history: { t: number; p: number }[] }>(`${urls.clob}/prices-history?${q}`);
      return (res?.history ?? []).map((h): OddsPoint => [h.t * 1000, h.p]);
    },
    async current() {
      const res = await http.get<PolyEvent[]>(`${urls.gamma}/events?slug=${event.slug}`);
      const out = new Map<string, number>();
      for (const m of res?.[0]?.markets ?? []) {
        const token = tokenOf(m);
        if (!token) continue;
        const bid = m.bestBid ?? null;
        const ask = m.bestAsk ?? null;
        const p = bid !== null && ask !== null && ask > bid && ask - bid <= 0.15 ? (bid + ask) / 2 : Number(parseList(m.outcomePrices)[0]);
        if (Number.isFinite(p)) out.set(token, p);
      }
      return out;
    },
  };
}

async function findEvent(http: JsonFetcher, meeting: MeetingInfo, gamma: string): Promise<PolyEvent | null> {
  const slug = normalize(meeting.name).replace(/ /g, '-');
  if (meeting.raceStart !== null) {
    for (const shift of [0, -1, 1]) {
      const date = new Date(meeting.raceStart + shift * 86_400_000).toISOString().slice(0, 10);
      const res = await http.get<PolyEvent[]>(`${gamma}/events?slug=f1-${slug}-winner-${date}`);
      if (res?.[0]) return res[0];
    }
  }
  // Fall back to scanning open F1 events for "<Grand Prix>: Driver Winner".
  const keys = meetingKeys(meeting.name);
  const open = await http.get<PolyEvent[]>(`${gamma}/events?tag_slug=formula1&closed=false&limit=200`);
  return (open ?? []).find((e) => /driver winner/i.test(e.title) && titleMatches(e.title, keys) && e.slug.includes(String(meeting.year))) ?? null;
}

function parseList(s: string | undefined): string[] {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
