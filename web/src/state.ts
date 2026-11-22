import { create } from 'zustand';
import { addSample, resetCars, syncClock } from './motion';
import type {
  ClientMessage,
  ClockState,
  DriverInfo,
  LiveStatus,
  OpenF1Record,
  ServerMessage,
  SessionInfo,
  StoreSnapshot,
  TelemetryEvent,
  TrackOutline,
} from '../../server/src/types';

export interface DashboardState extends Omit<StoreSnapshot, 'location'> {
  connected: boolean;
  status: { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string };
  session: SessionInfo | null;
  drivers: Record<string, DriverInfo>;
  track: TrackOutline | null;
  totalLaps: number | null;
  clock: (ClockState & { receivedAt: number }) | null;
  live: LiveStatus;
}

export const useDashboard = create<DashboardState>(() => ({
  connected: false,
  status: { status: 'idle' },
  session: null,
  drivers: {},
  track: null,
  totalLaps: null,
  clock: null,
  live: { configured: false, feed: 'off' },
  position: {},
  intervals: {},
  laps: {},
  best_laps: {},
  stints: {},
  stint_history: {},
  pit: [],
  race_control: [],
  weather: null,
}));

let socket: WebSocket | null = null;

export function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

export function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => {
    useDashboard.setState({ connected: true });
    // The sync delay is a per-viewer preference; restore it on every (re)connect.
    send({ type: 'delay', delayMs: loadDelay() });
  };
  socket.onclose = () => {
    useDashboard.setState({ connected: false });
    setTimeout(connect, 1500);
  };
  socket.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerMessage);
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case 'status':
      useDashboard.setState({ status: { status: msg.status, message: msg.message } });
      break;
    case 'meta':
      resetCars();
      useDashboard.setState({
        session: msg.session,
        track: msg.track,
        totalLaps: msg.totalLaps,
        drivers: Object.fromEntries(msg.drivers.map((d) => [String(d.driver_number), d])),
      });
      break;
    case 'snapshot': {
      const { location, ...rest } = msg.state;
      resetCars();
      for (const [driver, rec] of Object.entries(location)) addSample(driver, Date.parse(String(rec.date)), Number(rec.x), Number(rec.y));
      useDashboard.setState(rest);
      break;
    }
    case 'events':
      applyEvents(msg.events);
      break;
    case 'live':
      useDashboard.setState({ live: msg.live });
      break;
    case 'clock':
      syncClock(msg.clock);
      useDashboard.setState({ clock: { ...msg.clock, receivedAt: performance.now() } });
      break;
  }
}

function applyEvents(events: TelemetryEvent[]) {
  const s = useDashboard.getState();
  const next: Partial<DashboardState> = {};
  for (const e of events) {
    const driver = String(e.data.driver_number ?? '');
    switch (e.topic) {
      case 'location':
        addSample(driver, e.t, Number(e.data.x), Number(e.data.y));
        break;
      case 'position':
      case 'intervals':
      case 'laps':
      case 'stints': {
        const map = (next[e.topic] ??= { ...s[e.topic] }) as Record<string, OpenF1Record>;
        map[driver] = e.data;
        if (e.topic === 'stints') {
          const hist = (next.stint_history ??= { ...s.stint_history });
          const list = [...(hist[driver] ?? [])];
          const i = list.findIndex((h) => h.stint_number === e.data.stint_number);
          if (i >= 0) list[i] = e.data;
          else list.push(e.data);
          hist[driver] = list;
        }
        if (e.topic === 'laps' && isFaster(e.data, (next.best_laps ??= { ...s.best_laps })[driver])) next.best_laps![driver] = e.data;
        break;
      }
      case 'pit':
      case 'race_control': {
        const list = (next[e.topic] ??= [...s[e.topic]]) as OpenF1Record[];
        list.push(e.data);
        if (list.length > 50) list.splice(0, list.length - 50);
        break;
      }
      case 'weather':
        next.weather = e.data;
        break;
    }
  }
  if (Object.keys(next).length > 0) useDashboard.setState(next);
}

function isFaster(lap: OpenF1Record, best: OpenF1Record | undefined): boolean {
  const d = lap.lap_duration;
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return false;
  return !best || d < Number(best.lap_duration);
}

const DELAY_KEY = 'f1dash.delayMs';

export function loadDelay(): number {
  try {
    return Number(localStorage.getItem(DELAY_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setDelay(ms: number) {
  const v = Math.max(0, Math.min(180_000, Math.round(ms)));
  try {
    localStorage.setItem(DELAY_KEY, String(v));
  } catch {
    /* private mode: keep it for this session only */
  }
  send({ type: 'delay', delayMs: v });
}
