import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenF1Client } from '../src/openf1/client.js';

let dir = '';
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('OpenF1Client', () => {
  it('caches responses on disk and treats 404 as empty', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openf1-'));
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (url.includes('pit')) return new Response('{"detail":"No results found."}', { status: 404 });
      return new Response(JSON.stringify([{ session_key: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new OpenF1Client(dir, 0, fakeFetch);

    expect(await client.get('sessions', { session_key: 1 })).toEqual([{ session_key: 1 }]);
    expect(await client.get('sessions', { session_key: 1 })).toEqual([{ session_key: 1 }]);
    expect(await client.get('pit', { session_key: 1 })).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe('https://api.openf1.org/v1/sessions?session_key=1');
  });
});

describe('OpenF1Client with a sponsor login', () => {
  it('sends the bearer token on every request by default', async () => {
    const { TokenManager } = await import('../src/openf1/auth.js');
    const seen: (string | undefined)[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/token')) return Response.json({ access_token: 'abc', expires_in: '3600' });
      seen.push((init?.headers as Record<string, string>).authorization);
      return Response.json([]);
    }) as unknown as typeof fetch;
    const tokens = new TokenManager('u', 'p', { fetchImpl: fakeFetch, url: 'https://x/token' });
    const client = new OpenF1Client(tmpdir(), 0, fakeFetch, tokens);
    await client.get('laps', { session_key: 1 }, { cache: false });
    expect(seen).toEqual(['Bearer abc']);
  });
});
