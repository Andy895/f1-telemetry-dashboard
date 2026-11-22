import mqtt, { type MqttClient } from 'mqtt';
import type { TokenManager } from '../openf1/auth.js';
import { TOPICS } from '../types.js';
import { parseLiveMessage, type LiveMessage } from './messages.js';

export const DEFAULT_MQTT_URL = 'mqtts://mqtt.openf1.org:8883';

export interface LiveSourceOptions {
  url?: string;
  username: string;
  tokens: TokenManager;
  onMessage: (msg: LiveMessage) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error', detail?: string) => void;
}

/**
 * OpenF1 live stream over MQTT. Subscribes to every topic the dashboard uses, and reconnects
 * with a fresh token shortly before the current one expires (tokens last 1 hour).
 */
export class LiveSource {
  private client: MqttClient | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly opts: LiveSourceOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.client?.end(true);
    this.client = null;
    this.opts.onStatus?.('closed');
  }

  private async connect(): Promise<void> {
    const { tokens, username, onMessage, onStatus } = this.opts;
    onStatus?.('connecting');
    const password = await tokens.get();
    let client: MqttClient;
    try {
      // No automatic retries until the first connection works, so a bad login fails fast.
      client = await mqtt.connectAsync(this.opts.url ?? DEFAULT_MQTT_URL, {
        username: username || 'openf1-dashboard',
        password,
        reconnectPeriod: 0,
        connectTimeout: 15000,
        clean: true,
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (isAuthError(text)) {
        tokens.invalidate();
        throw new Error(`OpenF1 live feed refused the login (${text}). Check the sponsor email and password in .env.`);
      }
      throw new Error(`Could not connect to the OpenF1 live feed: ${text}`);
    }
    client.options.reconnectPeriod = 5000;
    if (this.stopped) {
      client.end(true);
      return;
    }
    this.client = client;
    client.on('message', (topic, payload) => {
      const msg = parseLiveMessage(topic, payload);
      if (msg) onMessage(msg);
    });
    client.on('reconnect', () => onStatus?.('reconnecting'));
    client.on('connect', () => onStatus?.('connected'));
    client.on('error', (err) => {
      // A rejected password usually means the token expired: fetch a new one on the next attempt.
      if (isAuthError(err.message)) tokens.invalidate();
      onStatus?.('error', err.message);
    });
    await client.subscribeAsync([...TOPICS, 'sessions', 'drivers'].map((t) => `v1/${t}`));
    onStatus?.('connected');
    this.scheduleRefresh();
  }

  /** Swap in a fresh token before the old one expires by reconnecting. */
  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const wait = Math.max(30_000, this.opts.tokens.msUntilRefresh());
    this.refreshTimer = setTimeout(async () => {
      if (this.stopped) return;
      const old = this.client;
      this.client = null;
      old?.end(true);
      try {
        await this.connect();
      } catch (err) {
        this.opts.onStatus?.('error', err instanceof Error ? err.message : String(err));
        this.scheduleRefresh();
      }
    }, wait);
  }
}

function isAuthError(text: string): boolean {
  return /not authori[sz]ed|bad user ?name or password/i.test(text);
}
