import { describe, expect, it } from 'vitest';
import { JsonFetcher } from '../src/odds/http.js';
import { findKalshiMarket, quotePrice } from '../src/odds/kalshi.js';
import { matchDriver, meetingKeys, titleMatches } from '../src/odds/match.js';
import { findPolymarketMarket } from '../src/odds/polymarket.js';
import { OddsService } from '../src/odds/service.js';
import type { OpenF1Client } from '../src/openf1/client.js';
import type { DriverInfo, SessionInfo } from '../src/types.js';

const driver = (n: number, full_name: string, code: string): DriverInfo => ({ driver_number: n, full_name, name_acronym: code, team_name: 'T', team_colour: 'ffffff' });
const DRIVERS = [
  driver(1, 'Max VERSTAPPEN', 'VER'),
  driver(4, 'Lando NORRIS', 'NOR'),
  driver(55, 'Carlos SAINZ', 'SAI'),
  driver(12, 'Andrea Kimi ANTONELLI', 'ANT'),
  driver(27, 'Nico HULKENBERG', 'HUL'),
];

/** Fake HTTP server: maps "path?query" prefixes to JSON bodies. */
function fakeFetch(routes: Record<string, unknown>, seen: string[] = []) {
  return (async (url: string) => {
    const u = new URL(url);
    const key = `${u.pathname}${u.search}`;
    seen.push(key);
    const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
    if (!hit) return new Response('not found', { status: 404 });
    return Response.json(hit[1]);
  }) as typeof fetch;
}

describe('matching markets to drivers', () => {
  it('matches display names to OpenF1 names', () => {
    expect(matchDriver('Carlos Sainz Jr.', DRIVERS)).toBe(55);
    expect(matchDriver('Kimi Antonelli', DRIVERS)).toBe(12);
    expect(matchDriver('Nico Hülkenberg', DRIVERS)).toBe(27);
    expect(matchDriver('Lewis Hamilton', DRIVERS)).toBeNull();
  });

  it('matches meeting names, including the names markets use instead', () => {
    expect(titleMatches('Abu Dhabi Grand Prix 2025 Winner?', meetingKeys('Abu Dhabi Grand Prix'))).toBe(true);
    expect(titleMatches('Brazil Grand Prix Main Race Winner', meetingKeys('São Paulo Grand Prix'))).toBe(true);
    expect(titleMatches('Las Vegas Grand Prix Main Race Winner', meetingKeys('Abu Dhabi Grand Prix'))).toBe(false);
  });

  it('uses the bid/ask middle only when the market is tight', () => {
    expect(quotePrice(0.55, 0.57, 0.5)).toBeCloseTo(0.56);
    expect(quotePrice(0, 1, 0.01)).toBe(0.01);
    expect(quotePrice(null, null, null)).toBeNull();
    expect(quotePrice(0.07, 0.25, 0.85)).toBe(0.25); // a stray trade is pulled back inside the book
  });
});

const meeting = { name: 'Abu Dhabi Grand Prix', year: 2025, raceStart: Date.parse('2025-12-07T13:00:00Z') };

describe('Kalshi', () => {
  it('finds the race event and falls back to the historical endpoints once settled', async () => {
    const seen: string[] = [];
    const http = new JsonFetcher(
      fakeFetch(
        {
          '/v2/events?series_ticker=KXF1RACE': {
            events: [
              { event_ticker: 'KXF1RACE-LASV26', title: 'Las Vegas Grand Prix Main Race Winner' },
              { event_ticker: 'KXF1RACE-ABUDGP25', title: 'Abu Dhabi Grand Prix 2025 Winner?', sub_title: 'Abu Dhabi Grand Prix 2025' },
            ],
          },
          '/v2/markets?event_ticker=KXF1RACE-ABUDGP25': { markets: [] },
          '/v2/historical/markets?event_ticker=KXF1RACE-ABUDGP25': {
            markets: [
              { ticker: 'KXF1RACE-ABUDGP25-VER', yes_sub_title: 'Max Verstappen', last_price: '0.99' },
              { ticker: 'KXF1RACE-ABUDGP25-NOR', yes_sub_title: 'Lando Norris', last_price: '0.01' },
            ],
          },
          '/v2/historical/markets/KXF1RACE-ABUDGP25-VER/candlesticks': {
            candlesticks: [
              { end_period_ts: 1765112400, price: { close: '0.70' }, yes_bid: { close: '0.69' }, yes_ask: { close: '0.71' } },
              { end_period_ts: 1765112460, price: { close: '0.72' }, yes_bid: { close: null }, yes_ask: { close: null } },
            ],
          },
        },
        seen,
      ),
      0,
    );
    const market = await findKalshiMarket(http, meeting, DRIVERS, 'https://k.test/v2');
    expect(market?.source).toBe('kalshi');
    expect([...market!.markets.entries()]).toEqual([
      [1, 'KXF1RACE-ABUDGP25-VER'],
      [4, 'KXF1RACE-ABUDGP25-NOR'],
    ]);
    const hist = await market!.history('KXF1RACE-ABUDGP25-VER', 0, 1);
    expect(hist).toEqual([
      [1765112400_000, 0.7],
      [1765112460_000, 0.72],
    ]);
    const now = await market!.current();
    expect(now.get('KXF1RACE-ABUDGP25-VER')).toBe(0.99);
  });

  it('returns null when there is no market for the race', async () => {
    const http = new JsonFetcher(fakeFetch({ '/v2/events': { events: [] } }), 0);
    expect(await findKalshiMarket(http, meeting, DRIVERS, 'https://k.test/v2')).toBeNull();
  });
});

describe('Polymarket', () => {
  it('finds the winner event by slug and reads the Yes token prices', async () => {
    const event = {
      slug: 'f1-abu-dhabi-grand-prix-winner-2025-12-07',
      title: 'Abu Dhabi Grand Prix: Driver Winner',
      markets: [{ groupItemTitle: 'Lando Norris', outcomes: '["Yes","No"]', clobTokenIds: '["tokNOR","tokNORno"]', outcomePrices: '["0.2","0.8"]', bestBid: 0.19, bestAsk: 0.21 }],
    };
    const http = new JsonFetcher(
      fakeFetch({
        '/events?slug=f1-abu-dhabi-grand-prix-winner-2025-12-07': [event],
        '/prices-history?market=tokNOR': { history: [{ t: 100, p: 0.25 }] },
      }),
      0,
    );
    const market = await findPolymarketMarket(http, meeting, DRIVERS, { gamma: 'https://g.test', clob: 'https://c.test' });
    expect(market?.url).toBe('https://polymarket.com/event/f1-abu-dhabi-grand-prix-winner-2025-12-07');
    expect(market?.markets.get(4)).toBe('tokNOR');
    expect(await market!.history('tokNOR', 0, 1)).toEqual([[100_000, 0.25]]);
    expect((await market!.current()).get('tokNOR')).toBeCloseTo(0.2);
  });
});

describe('OddsService', () => {
  const session = { session_key: 1, meeting_key: 7, session_name: 'Race', date_start: '2025-12-07T13:00:00Z', location: 'Yas Island', year: 2025 } as SessionInfo;
  const openf1 = { get: async () => [{ meeting_name: 'Abu Dhabi Grand Prix' }] } as unknown as OpenF1Client;

  it('falls back to the second source and loads each driver history', async () => {
    const calls: string[] = [];
    const svc = new OddsService(openf1, null, fetch, [
      async (m) => {
        calls.push(`kalshi:${m.name}`);
        return null;
      },
      async () => ({
        source: 'polymarket',
        title: 'Abu Dhabi Grand Prix: Driver Winner',
        url: 'https://polymarket.com/event/x',
        markets: new Map([[4, 'tokNOR']]),
        history: async () => [[1, 0.3]],
        current: async () => new Map([['tokNOR', 0.4]]),
      }),
    ]);
    const res = await svc.load(session, DRIVERS, 0, 1);
    expect(calls).toEqual(['kalshi:Abu Dhabi Grand Prix']);
    expect(res.board).toMatchObject({ source: 'polymarket', series: { '4': [[1, 0.3]] } });
    expect(await svc.poll(res.market!)).toEqual({ '4': 0.4 });
  });

  it('explains when no source has a market', async () => {
    const svc = new OddsService(openf1, null, fetch, [async () => null]);
    const res = await svc.load(session, DRIVERS, 0, 1);
    expect(res.board).toBeNull();
    expect(res.note).toMatch(/No race-winner market found for the Abu Dhabi Grand Prix/);
  });
});
