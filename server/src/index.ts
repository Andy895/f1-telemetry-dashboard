import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.js';
import { Hub } from './net/hub.js';
import { startHttpServer } from './net/http.js';
import { TokenManager } from './openf1/auth.js';
import { OpenF1Client } from './openf1/client.js';
import { OddsService } from './odds/service.js';
import { SIM_HTTP_PORT, SIM_MQTT_PORT } from './tools/sim-ports.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
loadEnvFile(join(repoRoot, '.env'));

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? process.env.PORT ?? 8787);

if (args.simulate) {
  // Point everything at the local fake OpenF1 started by `npm run simulate`.
  Object.assign(process.env, {
    OPENF1_USERNAME: 'simulator',
    OPENF1_PASSWORD: 'simulator',
    OPENF1_API_URL: `http://localhost:${SIM_HTTP_PORT}/v1`,
    OPENF1_MQTT_URL: `mqtt://localhost:${SIM_MQTT_PORT}`,
  });
}
const apiUrl = process.env.OPENF1_API_URL || undefined;

const username = process.env.OPENF1_USERNAME ?? '';
const tokens = new TokenManager(username, process.env.OPENF1_PASSWORD ?? '', { url: apiUrl ? apiUrl.replace(/\/v1\/?$/, '/token') : undefined });
// Sponsors get 60 requests/min instead of 30, so requests can be spaced closer together.
const client = new OpenF1Client(
  join(repoRoot, 'data', args.simulate ? 'sim-cache' : 'cache'),
  args.simulate ? 0 : tokens.configured ? 1100 : 2100,
  fetch,
  tokens,
  apiUrl,
);
// Race-winner odds from Kalshi (Polymarket as backup). The simulator replays an old race as if it
// were live, so real-time market prices would not match it: odds are off there. ODDS=off turns them off.
const oddsOn = !args.simulate && process.env.ODDS !== 'off';
const odds = oddsOn ? new OddsService(client, join(repoRoot, 'data', 'cache')) : null;
const hub = new Hub(client, { tokens, odds, mqttUsername: username, mqttUrl: process.env.OPENF1_MQTT_URL || undefined });
hub.start();
startHttpServer({ port, hub, client, webDist: join(repoRoot, 'web', 'dist') });
console.log(tokens.configured ? 'OpenF1 sponsor login found: live data available.' : 'No OpenF1 login in .env: replays only.');

// Optional: preload a session, e.g. `npm start -- --session 9839`, or `--live`
if (args.live || args.simulate) void hub.goLive();
else if (args.session) void hub.load(Number(args.session));

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  }
  return out;
}
