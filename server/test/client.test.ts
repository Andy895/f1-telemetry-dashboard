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
