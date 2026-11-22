import type { DriverInfo } from '../types.js';
import type { JsonFetcher } from './http.js';
import { matchDriver, meetingKeys, titleMatches } from './match.js';
import type { MeetingInfo, OddsMarket, OddsPoint } from './types.js';

export const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';
const SERIES = 'KXF1RACE';

interface KalshiEvent {
  event_ticker: string;
  title: string;
  sub_title?: string;
}

interface KalshiMarket {
  ticker: string;
  yes_sub_title: string;
  last_price_dollars?: string;
  last_price?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
}

type Ohlc = Record<string, string | null | undefined>;
interface Candle {
  end_period_ts: number;
  price?: Ohlc;
  yes_bid?: Ohlc;
  yes_ask?: Ohlc;
}

/**
 * Kalshi's per-race "Main Race Winner" markets (series KXF1RACE). Public market data needs no
 * login. Settled races move to the /historical endpoints, which use plain field names.
 */
export async function findKalshiMarket(http: JsonFetcher, meeting: MeetingInfo, drivers: DriverInfo[], base = KALSHI_API): Promise<OddsMarket | null> {
  const event = await findEvent(http, meeting, base);
  if (!event) return null;

  let historical = false;
  let markets = (await http.get<{ markets: KalshiMarket[] }>(`${base}/markets?event_ticker=${event.event_ticker}&limit=100`))?.markets ?? [];
  if (markets.length === 0) {
    historical = true;
    markets = (await http.get<{ markets: KalshiMarket[] }>(`${base}/historical/markets?event_ticker=${event.event_ticker}&limit=100`))?.markets ?? [];
  }
  const byDriver = new Map<number, string>();
  for (const m of markets) {
    const n = matchDriver(m.yes_sub_title, drivers);
    if (n !== null && !byDriver.has(n)) byDriver.set(n, m.ticker);
  }
  if (byDriver.size === 0) return null;

  return {
    source: 'kalshi',
    title: event.title,
    url: `https://kalshi.com/markets/${SERIES.toLowerCase()}`,
    markets: byDriver,
    async history(ticker, from, to) {
      const q = `start_ts=${Math.floor(from / 1000)}&end_ts=${Math.ceil(to / 1000)}&period_interval=1`;
      const path = historical ? `historical/markets/${ticker}` : `series/${SERIES}/markets/${ticker}`;
      const res = await http.get<{ candlesticks: Candle[] }>(`${base}/${path}/candlesticks?${q}`);
      const out: OddsPoint[] = [];
      for (const c of res?.candlesticks ?? []) {
        const p = candlePrice(c);
        if (p !== null) out.push([c.end_period_ts * 1000, p]);
      }
      return out;
    },
    async current() {
      const url = historical ? `${base}/historical/markets?event_ticker=${event.event_ticker}&limit=100` : `${base}/markets?event_ticker=${event.event_ticker}&limit=100`;
      const res = await http.get<{ markets: KalshiMarket[] }>(url);
      const out = new Map<string, number>();
      for (const m of res?.markets ?? []) {
        const p = quotePrice(num(m.yes_bid_dollars), num(m.yes_ask_dollars), num(m.last_price_dollars ?? m.last_price));
        if (p !== null) out.set(m.ticker, p);
      }
      return out;
    },
  };
}

async function findEvent(http: JsonFetcher, meeting: MeetingInfo, base: string): Promise<KalshiEvent | null> {
  const keys = meetingKeys(meeting.name);
  const yy = String(meeting.year % 100).padStart(2, '0');
  let cursor = '';
  for (let page = 0; page < 5; page++) {
    const res = await http.get<{ events: KalshiEvent[]; cursor?: string }>(`${base}/events?series_ticker=${SERIES}&limit=200${cursor ? `&cursor=${cursor}` : ''}`);
    for (const e of res?.events ?? []) {
      const sameYear = e.event_ticker.endsWith(yy) || (e.sub_title ?? '').includes(String(meeting.year));
      if (sameYear && (titleMatches(e.title, keys) || titleMatches(e.sub_title ?? '', keys))) return e;
    }
    cursor = res?.cursor ?? '';
    if (!cursor) break;
  }
  return null;
}

function candlePrice(c: Candle): number | null {
  const bid = num(c.yes_bid?.close ?? c.yes_bid?.close_dollars);
  const ask = num(c.yes_ask?.close ?? c.yes_ask?.close_dollars);
  const last = num(c.price?.close ?? c.price?.close_dollars ?? c.price?.previous ?? c.price?.previous_dollars);
  return quotePrice(bid, ask, last);
}

/**
 * The price we show: the middle of the bid and ask when the market is tight, else the last trade.
 * A stray trade outside the current bid and ask (a one-off fill at 85c when the book is 7c-25c)
 * is pulled back inside it, so one odd trade does not draw a spike.
 */
export function quotePrice(bid: number | null, ask: number | null, last: number | null): number | null {
  const book = bid !== null && ask !== null && ask > bid;
  if (book && ask - bid <= 0.15) return (bid + ask) / 2;
  if (last === null) return book ? (bid + ask) / 2 : null;
  return book ? Math.min(ask, Math.max(bid, last)) : last;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
