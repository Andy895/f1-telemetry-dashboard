import { describe, expect, it } from 'vitest';
import { TokenManager } from '../src/openf1/auth.js';

function fakeTokenServer() {
  const calls: string[] = [];
  let n = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls.push(String(init?.body));
    n++;
    return new Response(JSON.stringify({ access_token: `tok${n}`, expires_in: '3600', token_type: 'bearer' }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('TokenManager', () => {
  it('fetches once, reuses the token, and renews 5 minutes before expiry', async () => {
    let now = 0;
    const { calls, fetchImpl } = fakeTokenServer();
    const tm = new TokenManager('me@example.com', 'pw', { fetchImpl, now: () => now });
    expect(await tm.get()).toBe('tok1');
    expect(await tm.get()).toBe('tok1');
    expect(calls).toEqual(['username=me%40example.com&password=pw']);
    now = 54 * 60_000;
    expect(await tm.get()).toBe('tok1');
    now = 56 * 60_000;
    expect(await tm.get()).toBe('tok2');
  });

  it('shares one request between concurrent callers', async () => {
    const { calls, fetchImpl } = fakeTokenServer();
    const tm = new TokenManager('u', 'p', { fetchImpl });
    const [a, b] = await Promise.all([tm.get(), tm.get()]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
  });

  it('explains a rejected login', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const tm = new TokenManager('u', 'bad', { fetchImpl });
    await expect(tm.get()).rejects.toThrow('rejected the username or password');
  });

  it('is not configured without a login', () => {
    expect(new TokenManager('', '').configured).toBe(false);
  });
});
