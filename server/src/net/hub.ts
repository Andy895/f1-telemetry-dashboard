import { LiveSource } from '../live/source.js';
import type { LiveMessage } from '../live/messages.js';
import type { TokenManager } from '../openf1/auth.js';
import type { OpenF1Client } from '../openf1/client.js';
import { DelayBuffer } from '../pipeline/delay.js';
import { LiveStore } from '../pipeline/store.js';
import { loadSession, loadLiveSnapshot } from '../replay/loader.js';
import { ReplayPlayer } from '../replay/player.js';
import { CarDataReplay } from '../replay/carData.js';
import { outlineForCircuit } from '../track/circuit.js';
import { PRE_SESSION_MS, type OddsService } from '../odds/service.js';
import type { OddsBoard, OddsMarket } from '../odds/types.js';
import type {
  ClientMessage,
  ClockState,
  DriverInfo,
  LiveStatus,
  ServerMessage,
  SessionInfo,
  TelemetryEvent,
  TrackOutline,
} from '../types.js';

const TICK_MS = 100;
const CLOCK_EVERY_MS = 500;
/** How often live market prices are fetched. */
export const ODDS_POLL_MS = 15_000;

type Send = (msg: ServerMessage) => void;
type Status = 'idle' | 'loading' | 'ready' | 'error';

interface Meta {
  session: SessionInfo;
  drivers: DriverInfo[];
  track: TrackOutline | null;
  totalLaps: number | null;
}

export interface HubOptions {
  tokens?: TokenManager | null;
  mqttUrl?: string;
  mqttUsername?: string;
  /** Injected for tests. */
  /** Race-winner odds. Left out, the dashboard shows no odds. */
  odds?: OddsService | null;
  /** Injected for tests. */
  createLiveSource?: (onMessage: (m: LiveMessage) => void, onStatus: (s: LiveStatus['feed'], d?: string) => void) => { start(): Promise<void>; stop(): void };
}

/**
 * Owns the one active session and its source (a replay of a past session, or the live feed):
 * source -> sync delay -> store -> connected browsers. Both modes share everything after the source.
 */
export class Hub {
  private clients = new Set<Send>();
  private store = new LiveStore();
  private delay = new DelayBuffer<TelemetryEvent>(0);
  private meta: Meta | null = null;
  private player: ReplayPlayer | null = null;
  private carReplay: CarDataReplay | null = null;
  /** Drivers whose car telemetry is streamed (at most 2). */
  private focus: number[] = [];
  private live: { source: { start(): Promise<void>; stop(): void } } | null = null;
  private liveStatus: LiveStatus;
  private status: { status: Status; message?: string; progress?: number } = { status: 'idle' };
  private timer: NodeJS.Timeout | null = null;
  private lastClock = 0;
  private loadToken = 0;
  private odds: { board: OddsBoard | null; note?: string } = { board: null };
  private oddsMarket: OddsMarket | null = null;
  private oddsTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: OpenF1Client,
    private readonly opts: HubOptions = {},
  ) {
    this.liveStatus = { configured: Boolean(opts.tokens?.configured), feed: 'off' };
  }

  /** True once a live session is loaded and streaming. */
  get isLive(): boolean {
    return this.live !== null && this.status.status === 'ready';
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.stopLive();
    this.stopOdds();
  }

  connect(send: Send): () => void {
    this.clients.add(send);
    send({ type: 'status', ...this.status });
    send({ type: 'live', live: this.liveStatus });
    send({ type: 'focus', drivers: this.focus });
    if (this.meta) {
      send(this.metaMessage());
      send({ type: 'snapshot', state: this.store.snapshot() });
      send({ type: 'clock', clock: this.clock() });
      send({ type: 'odds', odds: this.odds.board, note: this.odds.note });
    }
    return () => this.clients.delete(send);
  }

  async handle(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'load':
        await this.load(msg.session_key);
        break;
      case 'live':
        await this.goLive();
        break;
      case 'play':
        this.player?.play();
        break;
      case 'pause':
        this.player?.pause();
        break;
      case 'speed':
        this.player?.setSpeed(msg.speed);
        break;
      case 'seek':
        this.seek(msg.t);
        break;
      case 'delay':
        this.delay.setDelay(msg.delayMs);
        break;
      case 'focus':
        await this.setFocus(msg.drivers);
        break;
    }
    if (this.meta) this.broadcast({ type: 'clock', clock: this.clock() });
  }

  /** Replay a past session. */
  async load(sessionKey: number): Promise<void> {
    const token = ++this.loadToken;
    this.stopLive();
    this.stopOdds();
    this.setStatus('loading', 'Loading session');
    try {
      const loaded = await loadSession(this.client, sessionKey, (m, f) => this.setStatus('loading', m, f));
      if (token !== this.loadToken) return; // a newer load started meanwhile
      this.meta = loaded;
      this.player = new ReplayPlayer(loaded.events, loaded.start, loaded.end);
      this.carReplay = new CarDataReplay(this.client, sessionKey);
      this.broadcast(this.metaMessage());
      this.seek(loaded.start);
      this.setStatus('ready', `${loaded.events.length.toLocaleString()} events`);
      void this.loadOdds(token, loaded.session, loaded.drivers, loaded.start - PRE_SESSION_MS, loaded.end, false);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.setStatus('error', errorText(err));
    }
  }

  /**
   * Follow the current session live: load what has happened so far over REST, then stream
   * new data over MQTT. Needs an OpenF1 sponsor login.
   */
  async goLive(): Promise<void> {
    const token = ++this.loadToken;
    this.stopLive();
    this.stopOdds();
    this.player = null;
    this.carReplay = null;
    if (!this.liveStatus.configured) {
      this.setStatus('error', 'Live data needs an OpenF1 sponsor login in the .env file (see README).');
      return;
    }
    this.setStatus('loading', 'Finding the current session');
    try {
      const snap = await loadLiveSnapshot(this.client, (m) => this.setStatus('loading', m));
      if (token !== this.loadToken) return;
      this.setStatus('loading', 'Loading the track map');
      const track = await outlineForCircuit(this.client, snap.session).catch(() => null);
      if (token !== this.loadToken) return;

      this.meta = { session: snap.session, drivers: snap.drivers, track, totalLaps: null };
      this.delay.clear();
      this.store.reset();
      for (const e of snap.events) this.store.apply(e);
      this.broadcast(this.metaMessage());
      this.broadcast({ type: 'snapshot', state: this.store.snapshot() });

      const source = this.createLiveSource();
      this.live = { source };
      this.setLive({ feed: 'connecting' });
      await source.start();
      if (token !== this.loadToken) {
        source.stop();
        return;
      }
      this.setStatus('ready', 'Live');
      void this.loadOdds(token, snap.session, snap.drivers, Date.parse(snap.session.date_start) - PRE_SESSION_MS, Date.now(), true);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.stopLive();
      this.setStatus('error', errorText(err));
    }
  }

  private createLiveSource() {
    const onMessage = (m: LiveMessage) => this.onLiveMessage(m);
    const onStatus = (feed: LiveStatus['feed'], detail?: string) => this.setLive({ feed, detail });
    if (this.opts.createLiveSource) return this.opts.createLiveSource(onMessage, onStatus);
    return new LiveSource({
      url: this.opts.mqttUrl,
      username: this.opts.mqttUsername ?? '',
      tokens: this.opts.tokens!,
      onMessage,
      onStatus: (s, d) => onStatus(s === 'closed' ? 'off' : s, d),
    });
  }

  private onLiveMessage(m: LiveMessage): void {
    this.liveStatus.lastMessageAt = Date.now();
    if (m.kind === 'event') {
      if (m.event.topic === 'car_data' && !this.focus.includes(Number(m.event.data.driver_number))) return;
      this.delay.push(m.event);
      return;
    }
    if (!this.meta) return;
    if (m.kind === 'session') {
      // A new session started (e.g. qualifying after practice): reload everything for it.
      if (Number(m.data.session_key) !== this.meta.session.session_key) void this.goLive();
      return;
    }
    if (m.kind === 'driver') {
      const d = m.data as unknown as DriverInfo;
      if (!this.meta.drivers.some((x) => x.driver_number === d.driver_number)) {
        this.meta.drivers = [...this.meta.drivers, d];
        this.broadcast(this.metaMessage());
      }
    }
  }

  /**
   * Load race-winner prices for the session in the background (the dashboard works without
   * them). Live, keep polling the market; prices are stamped with real time, so the page's
   * delayed clock lines them up with the TV picture like everything else.
   */
  private async loadOdds(token: number, session: SessionInfo, drivers: DriverInfo[], from: number, to: number, live: boolean): Promise<void> {
    if (!this.opts.odds) return;
    const result = await this.opts.odds.load(session, drivers, from, to).catch((err) => ({ board: null, market: null, note: `Odds unavailable: ${errorText(err)}` }));
    if (token !== this.loadToken) return;
    this.odds = { board: result.board, note: result.note };
    this.oddsMarket = result.market;
    this.broadcast({ type: 'odds', odds: result.board, note: result.note });
    if (live && result.market) this.oddsTimer = setInterval(() => void this.pollOdds(token), ODDS_POLL_MS);
  }

  private async pollOdds(token: number): Promise<void> {
    const market = this.oddsMarket;
    const board = this.odds.board;
    if (!market || !board || !this.opts.odds) return;
    let prices: Record<string, number>;
    try {
      prices = await this.opts.odds.poll(market);
    } catch {
      return; // try again next time
    }
    if (token !== this.loadToken || Object.keys(prices).length === 0) return;
    const t = Date.now();
    for (const [driver, p] of Object.entries(prices)) (board.series[driver] ??= []).push([t, p]);
    this.broadcast({ type: 'odds_tick', t, prices });
  }

  private stopOdds(): void {
    if (this.oddsTimer) clearInterval(this.oddsTimer);
    this.oddsTimer = null;
    this.oddsMarket = null;
    this.odds = { board: null };
  }

  private stopLive(): void {
    if (!this.live) return;
    this.live.source.stop();
    this.live = null;
    this.setLive({ feed: 'off', detail: undefined });
  }

  private seek(t: number): void {
    if (!this.player) return;
    const history = this.player.seek(t);
    this.delay.clear();
    this.store.reset();
    for (const e of history) this.store.apply(e);
    this.broadcast({ type: 'snapshot', state: this.store.snapshot() });
    this.sendCarBackfill(this.player.state.t);
  }

  private async setFocus(drivers: number[]): Promise<void> {
    this.focus = [...new Set(drivers.map(Number).filter(Number.isFinite))].slice(0, 2);
    this.broadcast({ type: 'focus', drivers: this.focus });
    if (this.player && this.carReplay) {
      await this.carReplay.ensure(this.focus, this.player.state.t);
      this.sendCarBackfill(this.player.state.t);
    }
  }

  /** The last few seconds of telemetry for focused drivers, so traces start filled. */
  private sendCarBackfill(t: number): void {
    if (!this.carReplay) return;
    const backfill = this.carReplay.seek(t).filter((e) => this.focus.includes(Number(e.data.driver_number)));
    if (backfill.length > 0) this.broadcast({ type: 'events', events: backfill });
  }

  private tick(): void {
    if (this.player) {
      for (const e of this.player.tick()) this.delay.push(e);
      if (this.carReplay && this.focus.length > 0) for (const e of this.carReplay.advance(this.focus, this.player.state.t)) this.delay.push(e);
    }
    const ready = this.delay.drain();
    if (ready.length > 0) {
      for (const e of ready) this.store.apply(e);
      this.broadcast({ type: 'events', events: ready.map(slim) });
    }
    const now = Date.now();
    if (this.meta && now - this.lastClock >= CLOCK_EVERY_MS) {
      this.lastClock = now;
      this.broadcast({ type: 'clock', clock: this.clock() });
    }
  }

  private clock(): ClockState {
    const delayMs = this.delay.getDelay();
    if (this.live && this.meta) {
      // Live data is stamped with real time; what the page shows is `delay` behind now.
      return {
        mode: 'live',
        t: Date.now() - delayMs,
        start: Date.parse(this.meta.session.date_start),
        end: Date.parse(this.meta.session.date_end) + 3600_000,
        speed: 1,
        playing: true,
        delayMs,
      };
    }
    const p = this.player?.state ?? { t: 0, start: 0, end: 0, speed: 1, playing: false };
    // The page shows what has come out of the delay buffer, so shift the clock back by the delay.
    const shown = Math.max(p.start, p.t - (p.playing ? delayMs * p.speed : 0));
    return { mode: 'replay', ...p, t: shown, delayMs };
  }

  private metaMessage(): ServerMessage {
    const m = this.meta;
    return { type: 'meta', session: m?.session ?? null, drivers: m?.drivers ?? [], track: m?.track ?? null, totalLaps: m?.totalLaps ?? null };
  }

  private setStatus(status: Status, message?: string, progress?: number): void {
    this.status = { status, message, progress };
    this.broadcast({ type: 'status', status, message, progress });
  }

  private setLive(patch: Partial<LiveStatus>): void {
    this.liveStatus = { ...this.liveStatus, ...patch };
    this.broadcast({ type: 'live', live: this.liveStatus });
  }

  private broadcast(msg: ServerMessage): void {
    for (const send of this.clients) send(msg);
  }
}

/** Location is the bulk of the traffic; send only what the map needs. */
function slim(e: TelemetryEvent): TelemetryEvent {
  if (e.topic === 'car_data') {
    const { driver_number, speed, throttle, brake, n_gear, drs, rpm, date } = e.data;
    return { topic: e.topic, t: e.t, data: { driver_number, speed, throttle, brake, n_gear, drs, rpm, date } };
  }
  if (e.topic !== 'location') return e;
  const { driver_number, x, y, date } = e.data;
  return { topic: e.topic, t: e.t, data: { driver_number, x, y, date } };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
