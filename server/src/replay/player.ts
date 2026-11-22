import type { TelemetryEvent } from '../types.js';
import { indexAtTime } from './timeline.js';

/**
 * Plays a recorded timeline against the wall clock at a chosen speed.
 * Call `tick()` regularly; it returns the events whose session time has been reached.
 */
export class ReplayPlayer {
  private cursor = 0;
  private sessionT: number;
  private lastWall: number;
  private playing = false;
  private speed = 1;

  constructor(
    private readonly events: TelemetryEvent[],
    readonly start: number,
    readonly end: number,
    private readonly now: () => number = Date.now,
  ) {
    this.sessionT = start;
    this.lastWall = now();
  }

  play(): void {
    this.advanceClock();
    this.playing = true;
  }

  pause(): void {
    this.advanceClock();
    this.playing = false;
  }

  setSpeed(speed: number): void {
    this.advanceClock();
    this.speed = Math.min(Math.max(speed, 0.25), 60);
  }

  /** Jump to a session time. Returns all events up to that point so state can be rebuilt. */
  seek(t: number): TelemetryEvent[] {
    this.sessionT = Math.min(Math.max(t, this.start), this.end);
    this.lastWall = this.now();
    this.cursor = indexAtTime(this.events, this.sessionT);
    return this.events.slice(0, this.cursor);
  }

  tick(): TelemetryEvent[] {
    this.advanceClock();
    const target = indexAtTime(this.events, this.sessionT + 1);
    if (target <= this.cursor) return [];
    const due = this.events.slice(this.cursor, target);
    this.cursor = target;
    if (this.sessionT >= this.end) this.playing = false;
    return due;
  }

  get state() {
    return { t: this.sessionT, start: this.start, end: this.end, speed: this.speed, playing: this.playing };
  }

  private advanceClock(): void {
    const wall = this.now();
    if (this.playing) this.sessionT = Math.min(this.end, this.sessionT + (wall - this.lastWall) * this.speed);
    this.lastWall = wall;
  }
}
