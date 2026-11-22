/** Topics mirror OpenF1 endpoint names so live MQTT topics (v1/<topic>) map 1:1 later. */
export type Topic =
  | 'location'
  | 'position'
  | 'intervals'
  | 'laps'
  | 'stints'
  | 'pit'
  | 'race_control'
  | 'weather';

export const TOPICS: Topic[] = [
  'location',
  'position',
  'intervals',
  'laps',
  'stints',
  'pit',
  'race_control',
  'weather',
];

/** A raw OpenF1 record. Every record we stream has a `date` or `date_start`. */
export type OpenF1Record = Record<string, unknown> & { driver_number?: number };

/** One timestamped event flowing through the pipeline. `t` is ms since epoch (session time). */
export interface TelemetryEvent {
  topic: Topic;
  t: number;
  data: OpenF1Record;
}

export interface SessionInfo {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
}

export interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
  headshot_url?: string | null;
}

export interface TrackOutline {
  /** Polyline of [x, y] in OpenF1 track coordinates. */
  points: [number, number][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Messages the server sends to the browser. */
export type ServerMessage =
  | { type: 'meta'; session: SessionInfo | null; drivers: DriverInfo[]; track: TrackOutline | null; totalLaps: number | null }
  | { type: 'snapshot'; state: StoreSnapshot }
  | { type: 'events'; events: TelemetryEvent[] }
  | { type: 'clock'; clock: ClockState }
  | { type: 'status'; status: 'idle' | 'loading' | 'ready' | 'error'; message?: string };

export interface ClockState {
  /** Session time currently shown, ms since epoch. */
  t: number;
  start: number;
  end: number;
  speed: number;
  playing: boolean;
  delayMs: number;
}

export interface StoreSnapshot {
  location: Record<string, OpenF1Record>;
  position: Record<string, OpenF1Record>;
  intervals: Record<string, OpenF1Record>;
  laps: Record<string, OpenF1Record>;
  stints: Record<string, OpenF1Record>;
  pit: OpenF1Record[];
  race_control: OpenF1Record[];
  weather: OpenF1Record | null;
}

/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: 'load'; session_key: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; speed: number }
  | { type: 'seek'; t: number }
  | { type: 'delay'; delayMs: number };
