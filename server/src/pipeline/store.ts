import type { OpenF1Record, StoreSnapshot, TelemetryEvent } from '../types.js';

const FEED_LIMIT = 50;

/**
 * Latest-value store for one session. Mirrors what the browser holds, so a page that
 * connects (or refreshes) mid-session gets the full picture in one snapshot.
 */
export class LiveStore {
  private state: StoreSnapshot = emptySnapshot();

  apply(event: TelemetryEvent): void {
    const { topic, data } = event;
    const driver = String(data.driver_number ?? '');
    switch (topic) {
      case 'location':
      case 'position':
      case 'intervals':
        this.state[topic][driver] = data;
        break;
      case 'laps':
        // Keep each driver's latest lap, plus their best.
        this.state.laps[driver] = data;
        if (isFaster(data, this.state.best_laps[driver])) this.state.best_laps[driver] = data;
        break;
      case 'stints': {
        this.state.stints[driver] = data;
        const history = (this.state.stint_history[driver] ??= []);
        const i = history.findIndex((h) => h.stint_number === data.stint_number);
        if (i >= 0) history[i] = data;
        else history.push(data);
        break;
      }
      case 'pit':
        pushCapped(this.state.pit, data);
        break;
      case 'race_control':
        pushCapped(this.state.race_control, data);
        break;
      case 'weather':
        this.state.weather = data;
        break;
    }
  }

  reset(): void {
    this.state = emptySnapshot();
  }

  snapshot(): StoreSnapshot {
    return structuredClone(this.state);
  }
}

function isFaster(lap: OpenF1Record, best: OpenF1Record | undefined): boolean {
  const d = lap.lap_duration;
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return false;
  return !best || d < Number(best.lap_duration);
}

function pushCapped(list: OpenF1Record[], rec: OpenF1Record): void {
  list.push(rec);
  if (list.length > FEED_LIMIT) list.splice(0, list.length - FEED_LIMIT);
}

export function emptySnapshot(): StoreSnapshot {
  return { location: {}, position: {}, intervals: {}, laps: {}, best_laps: {}, stints: {}, stint_history: {}, pit: [], race_control: [], weather: null };
}
