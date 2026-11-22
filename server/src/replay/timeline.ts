import type { OpenF1Record, TelemetryEvent, Topic } from '../types.js';

/** The timestamp OpenF1 uses for each topic. */
const TIME_FIELD: Record<Topic, string> = {
  location: 'date',
  position: 'date',
  intervals: 'date',
  laps: 'date_start',
  stints: '', // stints carry no timestamp; placed by lap below
  pit: 'date',
  race_control: 'date',
  weather: 'date',
  car_data: 'date',
};

export function recordTime(topic: Topic, rec: OpenF1Record): number | null {
  const field = TIME_FIELD[topic];
  const raw = field ? rec[field] : undefined;
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/**
 * Merge per-topic record lists into one time-ordered event list.
 * Records without a usable time are dropped, except stints, which are placed at the start
 * of their first lap using `lapStarts` (driver -> lap -> ms).
 */
export function buildTimeline(
  byTopic: Partial<Record<Topic, OpenF1Record[]>>,
  lapStarts: Map<number, Map<number, number>> = new Map(),
): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  for (const [topic, records] of Object.entries(byTopic) as [Topic, OpenF1Record[]][]) {
    for (const data of records ?? []) {
      let t = recordTime(topic, data);
      if (topic === 'stints') t = stintTime(data, lapStarts);
      if (topic === 'location' && isEmptyLocation(data)) continue;
      if (t === null) continue;
      events.push({ topic, t, data });
    }
  }
  // Stable sort keeps same-time records in their original order.
  return events.sort((a, b) => a.t - b.t);
}

function stintTime(rec: OpenF1Record, lapStarts: Map<number, Map<number, number>>): number | null {
  const driver = rec.driver_number;
  const lap = rec.lap_start;
  if (typeof driver !== 'number' || typeof lap !== 'number') return null;
  const laps = lapStarts.get(driver);
  if (!laps) return null;
  return laps.get(lap) ?? laps.get(lap + 1) ?? null;
}

/** OpenF1 reports (0, 0, 0) while a car is not on track. */
export function isEmptyLocation(rec: OpenF1Record): boolean {
  return rec.x === 0 && rec.y === 0 && rec.z === 0;
}

/** Index of the first event with t >= target (binary search). */
export function indexAtTime(events: TelemetryEvent[], target: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid]!.t < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
