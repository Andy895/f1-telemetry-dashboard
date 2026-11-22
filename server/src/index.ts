import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hub } from './net/hub.js';
import { startHttpServer } from './net/http.js';
import { OpenF1Client } from './openf1/client.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? process.env.PORT ?? 8787);

const client = new OpenF1Client(join(repoRoot, 'data', 'cache'));
const hub = new Hub(client);
hub.start();
startHttpServer({ port, hub, client, webDist: join(repoRoot, 'web', 'dist') });

// Optional: preload a session, e.g. `npm start -- --session 9839`
if (args.session) void hub.load(Number(args.session));

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
  }
  return out;
}
