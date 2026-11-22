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
        // Keep each driver's latest lap only.
        this.state.laps[driver] = data;
        break;
      case 'stints':
        this.state.stints[driver] = data;
        break;
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

function pushCapped(list: OpenF1Record[], rec: OpenF1Record): void {
  list.push(rec);
  if (list.length > FEED_LIMIT) list.splice(0, list.length - FEED_LIMIT);
}

export function emptySnapshot(): StoreSnapshot {
  return { location: {}, position: {}, intervals: {}, laps: {}, stints: {}, pit: [], race_control: [], weather: null };
}
