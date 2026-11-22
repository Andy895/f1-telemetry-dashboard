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
// Race-winner odds from Kalshi (Polymarket as backup). ODDS=off turns them off. The simulator
// serves that race's real Kalshi prices, shifted in time like the rest of the race.
const odds =
  process.env.ODDS === 'off'
    ? null
    : args.simulate
      ? new OddsService(client, null, fetch, null, { kalshiBase: `http://localhost:${SIM_HTTP_PORT}/kalshi`, polymarket: false })
      : new OddsService(client, join(repoRoot, 'data', 'cache'));
const hub = new Hub(client, { tokens, odds, mqttUsername: username, mqttUrl: process.env.OPENF1_MQTT_URL || undefined });
hub.start();
startHttpServer({ port, hub, client, webDist: join(repoRoot, 'web', 'dist') });
console.log(tokens.configured ? 'OpenF1 sponsor login found: live data available.' : 'No OpenF1 login in .env: replays only.');

// Optional: preload a session, e.g. `npm start -- --session 9839`, or `--live`
if (args.simulate) void goLiveWhenSimulatorIsUp();
else if (args.live) void hub.goLive();
else if (args.session) void hub.load(Number(args.session));

/** The simulator starts alongside this server and needs a few seconds to load the race first. */
async function goLiveWhenSimulatorIsUp() {
  for (let i = 0; i < 60 && !hub.isLive; i++) {
    await hub.goLive();
    if (!hub.isLive) await new Promise((r) => setTimeout(r, 3000));
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  }
  return out;
}
