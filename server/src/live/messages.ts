import { isEmptyLocation, recordTime } from '../replay/timeline.js';
import { TOPICS, type OpenF1Record, type TelemetryEvent, type Topic } from '../types.js';

export type LiveMessage =
  | { kind: 'event'; event: TelemetryEvent }
  | { kind: 'session'; data: OpenF1Record }
  | { kind: 'driver'; data: OpenF1Record };

/** Turn one MQTT message (topic `v1/<endpoint>`, JSON payload) into something the hub understands. */
export function parseLiveMessage(topic: string, payload: Buffer | string, now = Date.now()): LiveMessage | null {
  const name = topic.replace(/^v1\//, '');
  let data: OpenF1Record;
  try {
    data = JSON.parse(String(payload)) as OpenF1Record;
  } catch {
    return null;
  }
  if (name === 'sessions') return { kind: 'session', data };
  if (name === 'drivers') return { kind: 'driver', data };
  if (!TOPICS.includes(name as Topic) && name !== 'car_data') return null;
  const t = name as Topic;
  if (t === 'location' && isEmptyLocation(data)) return null;
  // Stints carry no timestamp; live, "now" is the right moment for them.
  return { kind: 'event', event: { topic: t, t: recordTime(t, data) ?? now, data } };
}
