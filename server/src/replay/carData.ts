import type { OpenF1Client } from '../openf1/client.js';
import type { OpenF1Record, TelemetryEvent } from '../types.js';
import { indexAtTime } from './timeline.js';

/**
 * Car telemetry (speed, throttle, brake, gear, DRS) for replays. It is large (~5 MB per car
 * per race), so it is only loaded for the drivers someone is focusing on, then played out
 * alongside the main timeline.
 */
export class CarDataReplay {
  private tracks = new Map<number, TelemetryEvent[]>();
  private cursors = new Map<number, number>();
  private loading = new Set<number>();

  constructor(
    private readonly client: OpenF1Client,
    private readonly sessionKey: number,
  ) {}

  /** Make sure these drivers are loaded; `t` is where playback is now. */
  async ensure(drivers: number[], t: number): Promise<void> {
    await Promise.all(
      drivers
        .filter((d) => !this.tracks.has(d) && !this.loading.has(d))
        .map(async (d) => {
          this.loading.add(d);
          try {
            const rows = await this.client.get<OpenF1Record[]>('car_data', { session_key: this.sessionKey, driver_number: d });
            const events = rows
              .map((data) => ({ topic: 'car_data' as const, t: Date.parse(String(data.date)), data }))
              .filter((e) => Number.isFinite(e.t))
              .sort((a, b) => a.t - b.t);
            this.tracks.set(d, events);
            this.cursors.set(d, indexAtTime(events, t));
          } finally {
            this.loading.delete(d);
          }
        }),
    );
  }

  /** Samples for the focused drivers between the last call and session time `t`. */
  advance(drivers: number[], t: number): TelemetryEvent[] {
    const out: TelemetryEvent[] = [];
    for (const d of drivers) {
      const events = this.tracks.get(d);
      if (!events) continue;
      const from = this.cursors.get(d) ?? 0;
      const to = indexAtTime(events, t + 1);
      if (to > from) out.push(...events.slice(from, to));
      this.cursors.set(d, Math.max(from, to));
    }
    return out;
  }

  /** After a seek: carry on from `t`, and include the last few seconds so the trace isn't empty. */
  seek(t: number, backfillMs = 20_000): TelemetryEvent[] {
    const out: TelemetryEvent[] = [];
    for (const [d, events] of this.tracks) {
      const to = indexAtTime(events, t);
      out.push(...events.slice(indexAtTime(events, t - backfillMs), to));
      this.cursors.set(d, to);
    }
    return out;
  }
}
