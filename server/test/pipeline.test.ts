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
});
