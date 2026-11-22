import { describe, expect, it } from 'vitest';
import { DelayBuffer } from '../src/pipeline/delay.js';
import { LiveStore } from '../src/pipeline/store.js';

describe('DelayBuffer', () => {
  it('releases items only after the delay has passed', () => {
    let now = 0;
    const buf = new DelayBuffer<string>(1000, () => now);
    buf.push('a');
    now = 500;
    buf.push('b');
    expect(buf.drain()).toEqual([]);
    now = 1000;
    expect(buf.drain()).toEqual(['a']);
    now = 1500;
    expect(buf.drain()).toEqual(['b']);
  });

  it('passes items straight through with zero delay', () => {
    const buf = new DelayBuffer<number>(0, () => 0);
    buf.push(1);
    expect(buf.drain()).toEqual([1]);
  });
});

describe('LiveStore', () => {
  it('keeps the latest value per driver and caps feeds', () => {
    const store = new LiveStore();
    store.apply({ topic: 'position', t: 1, data: { driver_number: 1, position: 2 } });
    store.apply({ topic: 'position', t: 2, data: { driver_number: 1, position: 1 } });
    for (let i = 0; i < 60; i++) store.apply({ topic: 'race_control', t: i, data: { message: `m${i}` } });
    const snap = store.snapshot();
    expect(snap.position['1']?.position).toBe(1);
    expect(snap.race_control).toHaveLength(50);
    expect(snap.race_control.at(-1)?.message).toBe('m59');
  });

  it('tracks each driver\'s best lap', () => {
    const store = new LiveStore();
    store.apply({ topic: 'laps', t: 1, data: { driver_number: 4, lap_number: 1, lap_duration: 95.1 } });
    store.apply({ topic: 'laps', t: 2, data: { driver_number: 4, lap_number: 2, lap_duration: 91.2 } });
    store.apply({ topic: 'laps', t: 3, data: { driver_number: 4, lap_number: 3, lap_duration: null } });
    store.apply({ topic: 'laps', t: 4, data: { driver_number: 4, lap_number: 4, lap_duration: 92.0 } });
    const snap = store.snapshot();
    expect(snap.best_laps['4']?.lap_number).toBe(2);
    expect(snap.laps['4']?.lap_number).toBe(4);
  });

  it('keeps stint history per driver, replacing updated stints', () => {
    const store = new LiveStore();
    store.apply({ topic: 'stints', t: 1, data: { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_end: 10 } });
    store.apply({ topic: 'stints', t: 2, data: { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_end: 18 } });
    store.apply({ topic: 'stints', t: 3, data: { driver_number: 4, stint_number: 2, compound: 'HARD' } });
    const snap = store.snapshot();
    expect(snap.stint_history['4']?.map((s) => s.lap_end ?? s.compound)).toEqual([18, 'HARD']);
    expect(snap.stints['4']?.stint_number).toBe(2);
  });
});
