import type { OpenF1Client } from '../openf1/client.js';
import { DelayBuffer } from '../pipeline/delay.js';
import { LiveStore } from '../pipeline/store.js';
import { loadSession, type LoadedSession } from '../replay/loader.js';
import { ReplayPlayer } from '../replay/player.js';
import type { ClientMessage, ServerMessage, TelemetryEvent } from '../types.js';

const TICK_MS = 100;
const CLOCK_EVERY_MS = 500;

type Send = (msg: ServerMessage) => void;

/**
 * Owns the one active session: replay player -> sync delay -> store -> connected browsers.
 * Phase 1 adds a live MQTT source that feeds the same delay buffer instead of the player.
 */
export class Hub {
  private clients = new Set<Send>();
  private store = new LiveStore();
  private delay = new DelayBuffer<TelemetryEvent>(0);
  private loaded: LoadedSession | null = null;
  private player: ReplayPlayer | null = null;
  private status: { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string } = { status: 'idle' };
  private timer: NodeJS.Timeout | null = null;
  private lastClock = 0;
  private loadToken = 0;

  constructor(private readonly client: OpenF1Client) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  connect(send: Send): () => void {
    this.clients.add(send);
    send({ type: 'status', ...this.status });
    if (this.loaded) {
      send(this.metaMessage());
      send({ type: 'snapshot', state: this.store.snapshot() });
      send({ type: 'clock', clock: this.clock() });
    }
    return () => this.clients.delete(send);
  }

  async handle(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'load':
        await this.load(msg.session_key);
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
    }
    this.broadcast({ type: 'clock', clock: this.clock() });
  }

  async load(sessionKey: number): Promise<void> {
    const token = ++this.loadToken;
    this.setStatus('loading', 'Loading session');
    try {
      const loaded = await loadSession(this.client, sessionKey, (m) => this.setStatus('loading', m));
      if (token !== this.loadToken) return; // a newer load started meanwhile
      this.loaded = loaded;
      this.player = new ReplayPlayer(loaded.events, loaded.start, loaded.end);
      this.broadcast(this.metaMessage());
      this.seek(loaded.start);
      this.setStatus('ready', `${loaded.events.length.toLocaleString()} events`);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.setStatus('error', err instanceof Error ? err.message : String(err));
    }
  }

  private seek(t: number): void {
    if (!this.player) return;
    const history = this.player.seek(t);
    this.delay.clear();
    this.store.reset();
    for (const e of history) this.store.apply(e);
    this.broadcast({ type: 'snapshot', state: this.store.snapshot() });
  }

  private tick(): void {
    if (this.player) for (const e of this.player.tick()) this.delay.push(e);
    const ready = this.delay.drain();
    if (ready.length > 0) {
      for (const e of ready) this.store.apply(e);
      this.broadcast({ type: 'events', events: ready.map(slim) });
    }
    const now = Date.now();
    if (this.player && now - this.lastClock >= CLOCK_EVERY_MS) {
      this.lastClock = now;
      this.broadcast({ type: 'clock', clock: this.clock() });
    }
  }

  private clock() {
    const p = this.player?.state ?? { t: 0, start: 0, end: 0, speed: 1, playing: false };
    // The page shows what has come out of the delay buffer, so shift the clock back by the delay.
    const shown = Math.max(p.start, p.t - (p.playing ? this.delay.getDelay() * p.speed : 0));
    return { ...p, t: shown, delayMs: this.delay.getDelay() };
  }

  private metaMessage(): ServerMessage {
    const l = this.loaded;
    return { type: 'meta', session: l?.session ?? null, drivers: l?.drivers ?? [], track: l?.track ?? null, totalLaps: l?.totalLaps ?? null };
  }

  private setStatus(status: 'idle' | 'loading' | 'ready' | 'error', message?: string): void {
    this.status = { status, message };
    this.broadcast({ type: 'status', status, message });
  }

  private broadcast(msg: ServerMessage): void {
    for (const send of this.clients) send(msg);
  }
}

/** Location is the bulk of the traffic; send only what the map needs. */
function slim(e: TelemetryEvent): TelemetryEvent {
  if (e.topic !== 'location') return e;
  const { driver_number, x, y, date } = e.data;
  return { topic: e.topic, t: e.t, data: { driver_number, x, y, date } };
}
