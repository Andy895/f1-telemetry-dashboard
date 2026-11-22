import { describe, expect, it } from 'vitest';
import { buildTimeline, indexAtTime } from '../src/replay/timeline.js';

describe('buildTimeline', () => {
  it('merges topics in time order and drops empty locations', () => {
    const events = buildTimeline({
      position: [{ date: '2025-01-01T00:00:02Z', driver_number: 1, position: 1 }],
      location: [
        { date: '2025-01-01T00:00:01Z', driver_number: 1, x: 10, y: 20, z: 0 },
        { date: '2025-01-01T00:00:03Z', driver_number: 1, x: 0, y: 0, z: 0 },
      ],
      laps: [{ date_start: '2025-01-01T00:00:00Z', driver_number: 1, lap_number: 1 }],
    });
    expect(events.map((e) => e.topic)).toEqual(['laps', 'location', 'position']);
  });

  it('places stints at the start of their first lap', () => {
    const lapStarts = new Map([[44, new Map([[12, Date.parse('2025-01-01T00:20:00Z')]])]]);
    const [e] = buildTimeline({ stints: [{ driver_number: 44, lap_start: 12, compound: 'HARD' }] }, lapStarts);
    expect(e?.t).toBe(Date.parse('2025-01-01T00:20:00Z'));
  });

  it('drops records without a time', () => {
    expect(buildTimeline({ pit: [{ driver_number: 1 }] })).toHaveLength(0);
  });
});

describe('indexAtTime', () => {
  it('finds the first event at or after a time', () => {
    const events = [1, 2, 2, 5].map((t) => ({ topic: 'position' as const, t, data: {} }));
    expect(indexAtTime(events, 2)).toBe(1);
    expect(indexAtTime(events, 3)).toBe(3);
    expect(indexAtTime(events, 9)).toBe(4);
  });
});
