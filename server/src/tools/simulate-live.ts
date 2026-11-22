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
