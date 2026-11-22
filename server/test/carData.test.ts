import { describe, expect, it } from 'vitest';
import type { OpenF1Client } from '../src/openf1/client.js';
import { CarDataReplay } from '../src/replay/carData.js';

const iso = (s: number) => new Date(Date.UTC(2025, 0, 1, 0, 0, s)).toISOString();
const t = (s: number) => Date.UTC(2025, 0, 1, 0, 0, s);

function fakeClient(requests: string[]) {
  return {
    get: async (_e: string, p: Record<string, string | number>) => {
      requests.push(String(p.driver_number));
      return [1, 2, 3, 4, 5].map((s) => ({ date: iso(s), driver_number: p.driver_number, speed: s * 10 }));
    },
  } as unknown as OpenF1Client;
}

describe('CarDataReplay', () => {
  it('loads focused drivers once and plays samples forward from the current time', async () => {
    const requests: string[] = [];
    const r = new CarDataReplay(fakeClient(requests), 1);
    await r.ensure([81], t(2));
    await r.ensure([81], t(2));
    expect(requests).toEqual(['81']);
    expect(r.advance([81], t(3)).map((e) => e.data.speed)).toEqual([20, 30]);
    expect(r.advance([81], t(3))).toEqual([]);
    expect(r.advance([4], t(5))).toEqual([]); // not loaded
  });

  it('seek returns a short backfill and moves the cursor', async () => {
    const r = new CarDataReplay(fakeClient([]), 1);
    await r.ensure([81], t(0));
    expect(r.seek(t(4), 2000).map((e) => e.data.speed)).toEqual([20, 30]);
    expect(r.advance([81], t(5)).map((e) => e.data.speed)).toEqual([40, 50]);
  });
});
