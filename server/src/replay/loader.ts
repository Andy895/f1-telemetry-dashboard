import type { OpenF1Client } from '../openf1/client.js';
import type { DriverInfo, OpenF1Record, SessionInfo, TelemetryEvent, Topic, TrackOutline } from '../types.js';
import { buildTrackOutline } from '../track/outline.js';
import { buildTimeline } from './timeline.js';

export interface LoadedSession {
  session: SessionInfo;
  drivers: DriverInfo[];
  track: TrackOutline | null;
  totalLaps: number | null;
  events: TelemetryEvent[];
  start: number;
  end: number;
}

/** Topics fetched for the whole session in one request each. */
const SESSION_TOPICS: Topic[] = ['position', 'intervals', 'laps', 'stints', 'pit', 'race_control', 'weather'];

/**
 * Download (or read from cache) everything needed to replay one session.
 * Location is fetched per driver because the full-session payload is large.
 */
export async function loadSession(
  client: OpenF1Client,
  sessionKey: number,
  onProgress: (msg: string) => void = () => {},
): Promise<LoadedSession> {
  const [session] = await client.get<SessionInfo[]>('sessions', { session_key: sessionKey });
  if (!session) throw new Error(`Session ${sessionKey} not found`);

  onProgress('Loading drivers');
  const drivers = dedupeDrivers(await client.get<DriverInfo[]>('drivers', { session_key: sessionKey }));

  const byTopic: Partial<Record<Topic, OpenF1Record[]>> = {};
  for (const topic of SESSION_TOPICS) {
    onProgress(`Loading ${topic}`);
    byTopic[topic] = await client.get<OpenF1Record[]>(topic, { session_key: sessionKey });
  }

  const locationByDriver = new Map<number, OpenF1Record[]>();
  for (const [i, d] of drivers.entries()) {
    onProgress(`Loading car positions ${i + 1}/${drivers.length} (${d.name_acronym})`);
    locationByDriver.set(
      d.driver_number,
      await client.get<OpenF1Record[]>('location', { session_key: sessionKey, driver_number: d.driver_number }),
    );
  }
  byTopic.location = [...locationByDriver.values()].flat();

  const laps = byTopic.laps ?? [];
  const lapStarts = lapStartIndex(laps);
  const events = buildTimeline(byTopic, lapStarts);
  const track = buildTrackOutline(laps, locationByDriver);
  const totalLaps = laps.reduce((max, l) => Math.max(max, Number(l.lap_number) || 0), 0) || null;

  const start = Date.parse(session.date_start);
  const end = Math.max(Date.parse(session.date_end), events.at(-1)?.t ?? 0);
  return { session, drivers, track, totalLaps, events, start, end };
}

function dedupeDrivers(drivers: DriverInfo[]): DriverInfo[] {
  const seen = new Map<number, DriverInfo>();
  for (const d of drivers) seen.set(d.driver_number, d);
  return [...seen.values()].sort((a, b) => a.driver_number - b.driver_number);
}

function lapStartIndex(laps: OpenF1Record[]): Map<number, Map<number, number>> {
  const index = new Map<number, Map<number, number>>();
  for (const lap of laps) {
    const driver = lap.driver_number;
    const t = typeof lap.date_start === 'string' ? Date.parse(lap.date_start) : NaN;
    if (typeof driver !== 'number' || !Number.isFinite(t)) continue;
    if (!index.has(driver)) index.set(driver, new Map());
    index.get(driver)!.set(Number(lap.lap_number), t);
  }
  return index;
}
