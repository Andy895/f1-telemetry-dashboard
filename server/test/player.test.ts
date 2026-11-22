import { describe, expect, it } from 'vitest';
import { ReplayPlayer } from '../src/replay/player.js';

const events = [0, 1000, 2000, 3000, 10000].map((t) => ({ topic: 'position' as const, t, data: { t } }));

describe('ReplayPlayer', () => {
  it('emits events as session time passes, scaled by speed', () => {
    let now = 0;
    const p = new ReplayPlayer(events, 0, 10000, () => now);
    p.seek(0);
    p.setSpeed(2);
    p.play();
    expect(p.tick().map((e) => e.t)).toEqual([0]);
    now = 1000; // 2 s of session time at 2x
    expect(p.tick().map((e) => e.t)).toEqual([1000, 2000]);
    p.pause();
    now = 5000;
    expect(p.tick()).toEqual([]);
  });

  it('seek returns history and resumes from there', () => {
    let now = 0;
    const p = new ReplayPlayer(events, 0, 10000, () => now);
    expect(p.seek(2500).map((e) => e.t)).toEqual([0, 1000, 2000]);
    p.play();
    now = 600;
    expect(p.tick().map((e) => e.t)).toEqual([3000]);
  });

  it('stops at the end', () => {
    let now = 0;
    const p = new ReplayPlayer(events, 0, 10000, () => now);
    p.setSpeed(60);
    p.play();
    now = 1000;
    expect(p.tick()).toHaveLength(5);
    expect(p.state.playing).toBe(false);
  });
});
