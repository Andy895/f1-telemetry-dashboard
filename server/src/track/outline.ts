import type { OpenF1Record, TrackOutline } from '../types.js';
import { isEmptyLocation } from '../replay/timeline.js';

/**
 * Build a circuit outline from one clean lap of car positions.
 * OpenF1 has no track-map endpoint, so we trace the car with the most laps over a
 * representative green-flag lap (closest to the median lap time, not a pit in/out lap).
 */
export function buildTrackOutline(laps: OpenF1Record[], locationByDriver: Map<number, OpenF1Record[]>): TrackOutline | null {
  const candidates = laps.filter(
    (l) =>
      typeof l.lap_duration === 'number' &&
      typeof l.date_start === 'string' &&
      l.is_pit_out_lap !== true &&
      Number(l.lap_number) > 1 &&
      locationByDriver.has(Number(l.driver_number)),
  );
  if (candidates.length === 0) return fallbackOutline(locationByDriver);

  const durations = candidates.map((l) => Number(l.lap_duration)).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)]!;
  const best = candidates.reduce((a, b) =>
    Math.abs(Number(a.lap_duration) - median) <= Math.abs(Number(b.lap_duration) - median) ? a : b,
  );

  const start = Date.parse(String(best.date_start));
  const end = start + Number(best.lap_duration) * 1000;
  const samples = (locationByDriver.get(Number(best.driver_number)) ?? []).filter((p) => {
    const t = Date.parse(String(p.date));
    return t >= start && t <= end && !isEmptyLocation(p);
  });
  return samples.length >= 20 ? outlineFrom(samples) : fallbackOutline(locationByDriver);
}

/** Without lap data (e.g. practice), use the first driver's longest run of samples. */
function fallbackOutline(locationByDriver: Map<number, OpenF1Record[]>): TrackOutline | null {
  const first = [...locationByDriver.values()].find((l) => l.length > 0);
  if (!first) return null;
  const samples = first.filter((p) => !isEmptyLocation(p)).slice(0, 600);
  return samples.length >= 20 ? outlineFrom(samples) : null;
}

export function outlineFrom(samples: OpenF1Record[]): TrackOutline {
  const points = samples.map((p) => [Number(p.x), Number(p.y)] as [number, number]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    points,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  };
}
