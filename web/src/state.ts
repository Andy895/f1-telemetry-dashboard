import { create } from 'zustand';
import type {
  ClientMessage,
  ClockState,
  DriverInfo,
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
}

export const useDashboard = create<DashboardState>(() => ({
  connected: false,
  status: { status: 'idle' },
  session: null,
  drivers: {},
  track: null,
  totalLaps: null,
  clock: null,
  position: {},
  intervals: {},
  laps: {},
  stints: {},
  pit: [],
  race_control: [],
  weather: null,
}));

/**
 * Car positions change ~4 times a second per car, so they live outside React state.
 * The track map reads them every animation frame and interpolates between samples.
 */
export interface CarMotion {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** performance.now() when the latest sample arrived */
  at: number;
  /** how long to glide from `from` to `to`, in ms */
  dur: number;
  lastT: number;
}
export const carMotion = new Map<string, CarMotion>();

let socket: WebSocket | null = null;

export function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

export function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => useDashboard.setState({ connected: true });
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
      carMotion.clear();
      useDashboard.setState({
        session: msg.session,
        track: msg.track,
        totalLaps: msg.totalLaps,
        drivers: Object.fromEntries(msg.drivers.map((d) => [String(d.driver_number), d])),
      });
      break;
    case 'snapshot': {
      const { location, ...rest } = msg.state;
      carMotion.clear();
      for (const [driver, rec] of Object.entries(location)) setCar(driver, rec, true);
      useDashboard.setState(rest);
      break;
    }
    case 'events':
      applyEvents(msg.events);
      break;
    case 'clock':
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
        setCar(driver, e.data, false);
        break;
      case 'position':
      case 'intervals':
      case 'laps':
      case 'stints': {
        const map = (next[e.topic] ??= { ...s[e.topic] }) as Record<string, OpenF1Record>;
        map[driver] = e.data;
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

function setCar(driver: string, rec: OpenF1Record, jump: boolean) {
  const x = Number(rec.x);
  const y = Number(rec.y);
  const t = Date.parse(String(rec.date));
  const now = performance.now();
  const prev = carMotion.get(driver);
  const speed = useDashboard.getState().clock?.speed ?? 1;
  if (!prev || jump) {
    carMotion.set(driver, { fromX: x, fromY: y, toX: x, toY: y, at: now, dur: 1, lastT: t });
    return;
  }
  // Start from where the dot is drawn right now, so motion never snaps.
  const k = Math.min(1, (now - prev.at) / prev.dur);
  const curX = prev.fromX + (prev.toX - prev.fromX) * k;
  const curY = prev.fromY + (prev.toY - prev.fromY) * k;
  const gap = Number.isFinite(t - prev.lastT) ? (t - prev.lastT) / speed : 270;
  carMotion.set(driver, { fromX: curX, fromY: curY, toX: x, toY: y, at: now, dur: Math.min(Math.max(gap, 30), 2000), lastT: t });
}

/** Session time now, extrapolated between clock messages. */
export function sessionNow(clock: DashboardState['clock']): number {
  if (!clock) return 0;
  if (!clock.playing) return clock.t;
  return Math.min(clock.end, clock.t + (performance.now() - clock.receivedAt) * clock.speed);
}
