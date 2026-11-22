import type { OpenF1Client } from '../openf1/client.js';
import type { OpenF1Record, SessionInfo, TrackOutline } from '../types.js';
import { buildTrackOutline } from './outline.js';

/**
 * A live session has no completed laps to trace yet, so borrow the outline from the most
 * recent finished session at the same circuit. Historical data is free and cached on disk.
 */
export async function outlineForCircuit(client: OpenF1Client, live: SessionInfo & { circuit_key?: number }): Promise<TrackOutline | null> {
  if (!live.circuit_key) return null;
  const sessions = await client.get<(SessionInfo & { circuit_key: number })[]>('sessions', { circuit_key: live.circuit_key }, { cache: false, auth: true });
  const cutoff = Date.now() - 2 * 3600_000;
  const past = sessions
    .filter((s) => s.session_key !== live.session_key && Date.parse(s.date_end) < cutoff)
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));

  for (const s of past.slice(0, 4)) {
    const laps = await client.get<OpenF1Record[]>('laps', { session_key: s.session_key });
    const lap = pickLap(laps);
    if (!lap) continue;
    const start = String(lap.date_start);
    const end = new Date(Date.parse(start) + Number(lap.lap_duration) * 1000).toISOString();
    const location = await client.get<OpenF1Record[]>('location', {
      session_key: s.session_key,
      driver_number: Number(lap.driver_number),
      'date>': start,
      'date<': end,
    });
    const outline = buildTrackOutline([lap], new Map([[Number(lap.driver_number), location]]));
    if (outline) return outline;
  }
  return null;
}

/** A representative green-flag lap: closest to the median lap time, not lap 1 or an out-lap. */
export function pickLap(laps: OpenF1Record[]): OpenF1Record | null {
  const ok = laps.filter(
    (l) => typeof l.lap_duration === 'number' && typeof l.date_start === 'string' && l.is_pit_out_lap !== true && Number(l.lap_number) > 1,
  );
  if (ok.length === 0) return null;
  const sorted = ok.map((l) => Number(l.lap_duration)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return ok.reduce((a, b) => (Math.abs(Number(a.lap_duration) - median) <= Math.abs(Number(b.lap_duration) - median) ? a : b));
}
