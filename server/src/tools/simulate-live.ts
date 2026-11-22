/**
 * A fake OpenF1 for trying live mode when no race is on.
 *
 * Takes a past session, shifts its timestamps so that "now" is a chosen point in the race,
 * and serves it the way OpenF1 does during a live session: a token endpoint, REST that
 * requires the token, and an MQTT broker that publishes each record as its time arrives.
 *
 *   npm run simulate                      (2025 Abu Dhabi GP, starting 40 minutes in)
 *   npm run simulate -- --session 9839 --minutes 10
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Aedes from 'aedes';
import { OpenF1Client } from '../openf1/client.js';
import { loadSession } from '../replay/loader.js';
import { JsonFetcher } from '../odds/http.js';
import { findKalshiMarket } from '../odds/kalshi.js';
import { OddsService, PRE_SESSION_MS } from '../odds/service.js';
import type { OddsPoint } from '../odds/types.js';
import type { OpenF1Record, TelemetryEvent } from '../types.js';
import { SIM_HTTP_PORT, SIM_MQTT_PORT } from './sim-ports.js';

const TOKEN = 'simulated-token';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1] ?? '']] : [])),
) as Record<string, string>;
const sessionKey = Number(args.session ?? 9839);
const minutesIn = Number(args.minutes ?? 40);

const client = new OpenF1Client(join(repoRoot, 'data', 'cache'));
console.log(`Simulator: loading session ${sessionKey} (first time takes about a minute)…`);
const loaded = await loadSession(client, sessionKey, (m) => console.log(`Simulator: ${m}`));

// Shift every timestamp so the session started `minutesIn` minutes ago.
const shift = Date.now() - (loaded.start + minutesIn * 60_000);
const shiftRecord = (r: OpenF1Record): OpenF1Record => {
  const out: OpenF1Record = { ...r, session_key: 'SIM' as unknown as number };
  for (const k of ['date', 'date_start', 'date_end'] as const) {
    if (typeof r[k] === 'string') out[k] = new Date(Date.parse(r[k] as string) + shift).toISOString();
  }
  out.session_key = loaded.session.session_key;
  return out;
};
const events: TelemetryEvent[] = loaded.events.map((e) => ({ topic: e.topic, t: e.t + shift, data: shiftRecord(e.data) }));
const session = { ...shiftRecord(loaded.session as unknown as OpenF1Record), session_name: `${loaded.session.session_name} (simulated)` };

// --- Kalshi: that race's real winner-market prices, shifted the same way ---
// The dashboard asks this stand-in exactly what it would ask Kalshi during a live race.
// Loading takes ~30 s the first time, so the race starts right away and odds requests wait for it.
const oddsReady = loadOdds();
async function loadOdds() {
  try {
    const meeting = await new OddsService(client, null).meetingInfo(loaded.session);
    const market = await findKalshiMarket(new JsonFetcher(), meeting, loaded.drivers);
    if (!market) {
      console.log('Simulator: no Kalshi market for this race, so no odds.');
      return null;
    }
    console.log(`Simulator: loading Kalshi prices for "${market.title}"…`);
    const series = new Map<number, OddsPoint[]>();
    for (const [driver, ticker] of market.markets) {
      const hist = await market.history(ticker, loaded.start - PRE_SESSION_MS, loaded.end);
      series.set(driver, hist.map(([t, p]): OddsPoint => [t + shift, p]));
    }
    return { title: market.title, sub_title: `${meeting.name} ${meeting.year}`, year: meeting.year, series };
  } catch (err) {
    console.log(`Simulator: could not load Kalshi prices (${(err as Error).message}), so no odds.`);
    return null;
  }
}

function kalshi(odds: Awaited<typeof oddsReady>, path: string, params: Record<string, string>, now: number): unknown {
  if (!odds) return path === 'events' ? { events: [] } : null;
  const eventTicker = `KXF1RACE-SIM${String(odds.year % 100).padStart(2, '0')}`;
  const shown = (pts: OddsPoint[]) => pts.filter((p) => p[0] <= now);
  if (path === 'events') return { events: [{ event_ticker: eventTicker, title: odds.title, sub_title: odds.sub_title }], cursor: '' };
  if (path === 'markets') {
    return {
      markets: [...odds.series].map(([driver, pts]) => ({
        ticker: `SIM-${driver}`,
        yes_sub_title: loaded.drivers.find((d) => d.driver_number === driver)?.full_name ?? String(driver),
        last_price_dollars: String(shown(pts).at(-1)?.[1] ?? ''),
      })),
    };
  }
  const m = /^series\/KXF1RACE\/markets\/SIM-(\d+)\/candlesticks$/.exec(path);
  if (m) {
    const from = Number(params.start_ts) * 1000;
    const to = Math.min(Number(params.end_ts) * 1000, now);
    const pts = (odds.series.get(Number(m[1])) ?? []).filter((p) => p[0] >= from && p[0] <= to);
    return { candlesticks: pts.map(([t, p]) => ({ end_period_ts: Math.round(t / 1000), price: { close: String(p) } })) };
  }
  return null;
}

// --- MQTT: publish records as their (shifted) time arrives ---
const aedes = new Aedes();
aedes.authenticate = (_c, _u, password, done) => done(null, String(password) === TOKEN);
createTcpServer(aedes.handle).listen(SIM_MQTT_PORT, () => console.log(`Simulator: MQTT on mqtt://localhost:${SIM_MQTT_PORT}`));
let cursor = events.findIndex((e) => e.t > Date.now());
if (cursor < 0) cursor = events.length;
setInterval(() => {
  const now = Date.now();
  while (cursor < events.length && events[cursor]!.t <= now) {
    const e = events[cursor++]!;
    aedes.publish({ cmd: 'publish', topic: `v1/${e.topic}`, payload: Buffer.from(JSON.stringify(e.data)), qos: 0, retain: false, dup: false }, () => {});
  }
}, 100);

// --- REST: token + the endpoints the dashboard asks for ---
createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (body: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (url.pathname === '/token') return json({ access_token: TOKEN, expires_in: '3600', token_type: 'bearer' });
  if (url.pathname.startsWith('/kalshi/')) {
    const body = kalshi(await oddsReady, url.pathname.slice('/kalshi/'.length), Object.fromEntries(url.searchParams), Date.now());
    return body === null ? json({ error: 'not found' }, 404) : json(body);
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json({ detail: 'Unauthorized' }, 401);

  const endpoint = url.pathname.replace(/^\/v1\//, '');
  const params = Object.fromEntries(url.searchParams);
  const now = Date.now();
  if (endpoint === 'sessions' && params.session_key === 'latest') return json([session]);
  const isThisSession = params.session_key === 'latest' || Number(params.session_key) === loaded.session.session_key;
  if (!isThisSession) {
    // Anything else (e.g. past sessions for the track map) comes from the real, cached API.
    try {
      return json(await client.get(endpoint, Object.fromEntries(url.searchParams)));
    } catch (err) {
      return json({ detail: String(err) }, 502);
    }
  }
  if (endpoint === 'drivers') return json(loaded.drivers);
  const since = params['date>'] ? Date.parse(params['date>']) : -Infinity;
  return json(events.filter((e) => e.topic === endpoint && e.t <= now && e.t >= since).map((e) => e.data));
}).listen(SIM_HTTP_PORT, () => {
  console.log(`Simulator: REST on http://localhost:${SIM_HTTP_PORT}`);
  console.log(`Simulator: "${loaded.session.country_name} ${loaded.session.session_name}" is now live, ${minutesIn} minutes in.`);
});
