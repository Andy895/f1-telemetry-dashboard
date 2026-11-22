import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import type { OpenF1Client } from '../openf1/client.js';
import type { ClientMessage } from '../types.js';
import type { Hub } from './hub.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

export function startHttpServer(opts: { port: number; hub: Hub; client: OpenF1Client; webDist: string }) {
  const { port, hub, client, webDist } = opts;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/sessions') return await sessions(url, res, client);
      if (url.pathname === '/api/live') return await liveInfo(res, client);
      return await serveStatic(url.pathname, webDist, res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    const disconnect = hub.connect((msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    });
    ws.on('message', (raw) => {
      try {
        void hub.handle(JSON.parse(String(raw)) as ClientMessage);
      } catch {
        /* ignore malformed messages */
      }
    });
    ws.on('close', disconnect);
  });

  server.listen(port, () => console.log(`Dashboard server on http://localhost:${port}`));
  return server;
}

async function sessions(url: URL, res: ServerResponse, client: OpenF1Client) {
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  // Past seasons never change, so cache them; the current season gains sessions.
  const cache = year < new Date().getUTCFullYear();
  const list = await client.get<unknown[]>('sessions', { year }, { cache, auth: !cache && client.hasAuth });
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(list));
}

/** The latest session and whether it is inside OpenF1's live window right now. */
async function liveInfo(res: ServerResponse, client: OpenF1Client) {
  let session: { date_start: string; date_end: string } | null = null;
  let error: string | undefined;
  try {
    [session = null] = await client.get<{ date_start: string; date_end: string }[]>('sessions', { session_key: 'latest' }, { cache: false, auth: client.hasAuth });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const now = Date.now();
  const window = 30 * 60_000;
  const isLive = Boolean(session && now >= Date.parse(session.date_start) - window && now <= Date.parse(session.date_end) + window);
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ configured: client.hasAuth, session, isLive, error }));
}

async function serveStatic(pathname: string, root: string, res: ServerResponse) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(root, rel);
  if (!file.startsWith(root + sep) && file !== root) return notFound(res);
  const info = await stat(file).catch(() => null);
  if (!info || info.isDirectory()) file = join(root, 'index.html');
  const exists = await stat(file).catch(() => null);
  if (!exists) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Web app not built. Run "npm start", or use "npm run dev" and open http://localhost:5173');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function notFound(res: ServerResponse) {
  res.writeHead(404).end();
}

export type { IncomingMessage };
