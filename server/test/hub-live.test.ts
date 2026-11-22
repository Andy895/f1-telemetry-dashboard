import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Aedes from 'aedes';
import mqtt from 'mqtt';
import { afterEach, describe, expect, it } from 'vitest';
import { Hub } from '../src/net/hub.js';
import { TokenManager } from '../src/openf1/auth.js';
import { OpenF1Client } from '../src/openf1/client.js';
import type { ServerMessage } from '../src/types.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const now = Date.now();
const SESSION = {
  session_key: 9999,
  meeting_key: 1,
  circuit_key: 70,
  session_name: 'Race',
  session_type: 'Race',
  date_start: new Date(now - 30 * 60_000).toISOString(),
  date_end: new Date(now + 90 * 60_000).toISOString(),
  circuit_short_name: 'Test',
  country_name: 'Testland',
  location: 'Test',
  year: 2026,
};

/** Fake OpenF1 REST API: answers only with a valid bearer token, like the live window. */
function fakeOpenF1(seen: string[]) {
  return (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === '/token') return Response.json({ access_token: 'tok', expires_in: '3600' });
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    if (auth !== 'Bearer tok') return new Response('unauthorized', { status: 401 });
    seen.push(`${u.pathname}?${u.search.slice(1)}`);
    const endpoint = u.pathname.replace('/v1/', '');
    if (endpoint === 'sessions' && u.searchParams.get('session_key') === 'latest') return Response.json([SESSION]);
    if (endpoint === 'sessions') return Response.json([]);
    if (endpoint === 'drivers') return Response.json([{ driver_number: 81, name_acronym: 'PIA', full_name: 'Oscar PIASTRI', team_name: 'McLaren', team_colour: 'F47600' }]);
    if (endpoint === 'position') return Response.json([{ date: new Date(now - 60_000).toISOString(), driver_number: 81, position: 1 }]);
    return Response.json([]);
  }) as unknown as typeof fetch;
}

describe('Hub live mode', () => {
  it('seeds from REST, then streams MQTT messages to the browser', async () => {
    const aedes = new Aedes();
    aedes.authenticate = (_c, _u, password, done) => done(null, String(password) === 'tok');
    const server = createServer(aedes.handle);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `mqtt://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cleanups.push(() => new Promise<void>((r) => aedes.close(() => server.close(() => r()))));

    const dir = await mkdtemp(join(tmpdir(), 'hub-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const seen: string[] = [];
    const fetchImpl = fakeOpenF1(seen);
    const tokens = new TokenManager('me@example.com', 'pw', { fetchImpl, url: 'https://api.openf1.org/token' });
    const client = new OpenF1Client(dir, 0, fetchImpl, tokens);
    const hub = new Hub(client, { tokens, mqttUrl: url, mqttUsername: 'me@example.com' });
    hub.start();
    cleanups.push(() => hub.stop());

    const got: ServerMessage[] = [];
    hub.connect((m) => got.push(m));
    await hub.handle({ type: 'live' });

    const status = got.filter((m) => m.type === 'status').at(-1);
    expect(status).toMatchObject({ status: 'ready', message: 'Live' });
    const snapshot = got.find((m) => m.type === 'snapshot');
    expect(snapshot && snapshot.type === 'snapshot' && snapshot.state.position['81']?.position).toBe(1);
    expect(seen.some((s) => s.startsWith('/v1/location?') && s.includes('date%3E='))).toBe(true);

    const pub = await mqtt.connectAsync(url, { username: 'pub', password: 'tok' });
    cleanups.push(() => pub.endAsync());
    await pub.publishAsync('v1/location', JSON.stringify({ date: new Date().toISOString(), driver_number: 81, x: 100, y: 200, z: 0 }));
    await waitFor(() => got.some((m) => m.type === 'events' && m.events.some((e) => e.topic === 'location')));

    const clock = got.filter((m) => m.type === 'clock').at(-1);
    expect(clock && clock.type === 'clock' && clock.clock.mode).toBe('live');
    expect(got.filter((m) => m.type === 'live').at(-1)).toMatchObject({ live: { configured: true, feed: 'connected' } });
  });

  it('explains that live needs a login when none is configured', async () => {
    const hub = new Hub(new OpenF1Client(tmpdir(), 0, fetch), { tokens: new TokenManager('', '') });
    const got: ServerMessage[] = [];
    hub.connect((m) => got.push(m));
    await hub.handle({ type: 'live' });
    expect(got.at(-1)).toMatchObject({ type: 'status', status: 'error', message: expect.stringContaining('sponsor login') });
  });
});

async function waitFor(cond: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}
