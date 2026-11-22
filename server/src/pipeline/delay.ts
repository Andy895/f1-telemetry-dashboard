/**
 * Holds items for `delayMs` of wall-clock time before releasing them, so the dashboard
 * can be lined up with a TV stream that runs behind the live data.
 */
export class DelayBuffer<T> {
  private queue: { due: number; item: T }[] = [];

  constructor(
    private delayMs = 0,
    private readonly now: () => number = Date.now,
  ) {}

  setDelay(ms: number): void {
    this.delayMs = Math.max(0, ms);
  }

  getDelay(): number {
    return this.delayMs;
  }

  push(item: T): void {
    this.queue.push({ due: this.now() + this.delayMs, item });
  }

  /** Items whose delay has elapsed, oldest first. */
  drain(): T[] {
    const now = this.now();
    let i = 0;
    while (i < this.queue.length && this.queue[i]!.due <= now) i++;
    return this.queue.splice(0, i).map((q) => q.item);
  }

  clear(): void {
    this.queue = [];
  }

  get size(): number {
    return this.queue.length;
  }
}
