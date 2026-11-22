import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import Aedes from 'aedes';
import mqtt from 'mqtt';
import { afterEach, describe, expect, it } from 'vitest';
import { parseLiveMessage, type LiveMessage } from '../src/live/messages.js';
import { LiveSource } from '../src/live/source.js';
import { TokenManager } from '../src/openf1/auth.js';

describe('parseLiveMessage', () => {
  it('turns endpoint topics into timeline events', () => {
    const m = parseLiveMessage('v1/position', JSON.stringify({ date: '2025-12-07T13:00:01Z', driver_number: 1, position: 1 }));
    expect(m).toEqual({ kind: 'event', event: { topic: 'position', t: Date.parse('2025-12-07T13:00:01Z'), data: expect.any(Object) } });
  });

  it('stamps stints with the current time and drops empty locations', () => {
    expect(parseLiveMessage('v1/stints', '{"driver_number":4,"stint_number":2}', 123)).toMatchObject({ event: { t: 123 } });
    expect(parseLiveMessage('v1/location', '{"x":0,"y":0,"z":0,"date":"2025-01-01T00:00:00Z"}')).toBeNull();
  });

  it('routes sessions and drivers, and ignores unknown topics and bad JSON', () => {
    expect(parseLiveMessage('v1/sessions', '{"session_key":1}')?.kind).toBe('session');
    expect(parseLiveMessage('v1/drivers', '{"driver_number":1}')?.kind).toBe('driver');
    expect(parseLiveMessage('v1/overtakes', '{}')).toBeNull();
    expect(parseLiveMessage('v1/car_data', '{"date":"2025-01-01T00:00:00Z","driver_number":1,"speed":300}')).toMatchObject({ event: { topic: 'car_data' } });
    expect(parseLiveMessage('v1/laps', 'not json')).toBeNull();
  });
});

let broker: { server: Server; close: () => Promise<void> } | null = null;
afterEach(async () => {
  await broker?.close();
  broker = null;
});

/** A local MQTT broker that, like OpenF1, only accepts the current access token as password. */
async function startBroker(validToken: () => string) {
  const aedes = new Aedes();
  aedes.authenticate = (_client, _user, password, done) => {
    const ok = String(password) === validToken();
    done(ok ? null : Object.assign(new Error('Bad user name or password'), { returnCode: 4 }), ok);
  };
  const server = createServer(aedes.handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  broker = {
    server,
    close: () => new Promise<void>((r) => aedes.close(() => server.close(() => r()))),
  };
  return { url: `mqtt://127.0.0.1:${port}`, aedes };
}

describe('LiveSource', () => {
  it('signs in with the access token, subscribes, and delivers messages', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ access_token: 'secret-token', expires_in: '3600' }))) as unknown as typeof fetch;
    const tokens = new TokenManager('me@example.com', 'pw', { fetchImpl });
    const { url } = await startBroker(() => 'secret-token');

    const got: LiveMessage[] = [];
    const source = new LiveSource({ url, username: 'me@example.com', tokens, onMessage: (m) => got.push(m) });
    await source.start();

    const pub = await mqtt.connectAsync(url, { password: 'secret-token', username: 'publisher' });
    await pub.publishAsync('v1/location', JSON.stringify({ date: '2025-12-07T13:00:00Z', driver_number: 81, x: 10, y: 20, z: 1 }));
    await pub.publishAsync('v1/race_control', JSON.stringify({ date: '2025-12-07T13:00:01Z', message: 'GREEN LIGHT - PIT EXIT OPEN', category: 'Flag', flag: 'GREEN' }));
    await waitFor(() => got.length >= 2);
    await pub.endAsync();
    source.stop();

    expect(got.map((m) => (m.kind === 'event' ? m.event.topic : m.kind))).toEqual(['location', 'race_control']);
  });

  it('fails clearly when the broker rejects the token', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ access_token: 'stale', expires_in: '3600' }))) as unknown as typeof fetch;
    const tokens = new TokenManager('u', 'p', { fetchImpl });
    const { url } = await startBroker(() => 'fresh');
    const source = new LiveSource({ url, username: 'u', tokens, onMessage: () => {} });
    await expect(source.start()).rejects.toThrow(/refused the login/);
    source.stop();
  });
});

async function waitFor(cond: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}
