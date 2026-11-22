/**
 * Smooth car motion.
 *
 * Location samples arrive ~3.7 times a second per car, and over the network they come in
 * bursts. Moving a dot each time a sample lands looks choppy, so instead we buffer the samples
 * and draw every car at the same slightly-delayed session time, interpolating between the two
 * samples either side of it. It is the same trick video players use.
 */

interface Track {
  t: number[];
  x: number[];
  y: number[];
}

const MAX_SAMPLES = 200;
const tracks = new Map<string, Track>();

export function resetCars() {
  tracks.clear();
}

export function addSample(driver: string, t: number, x: number, y: number) {
  let tr = tracks.get(driver);
  if (!tr) {
    tr = { t: [], x: [], y: [] };
    tracks.set(driver, tr);
  }
  const last = tr.t.at(-1);
  if (last !== undefined && t <= last) {
    // Out-of-order or duplicate sample: ignore older, replace same-time.
    if (t < last) return;
    tr.x[tr.x.length - 1] = x;
    tr.y[tr.y.length - 1] = y;
    return;
  }
  tr.t.push(t);
  tr.x.push(x);
  tr.y.push(y);
  if (tr.t.length > MAX_SAMPLES) {
    tr.t.splice(0, tr.t.length - MAX_SAMPLES);
    tr.x.splice(0, tr.x.length - MAX_SAMPLES);
    tr.y.splice(0, tr.y.length - MAX_SAMPLES);
  }
}

/** Interpolated position of a car at session time `t`, or null if we have no samples. */
export function carAt(driver: string, t: number): { x: number; y: number } | null {
  const tr = tracks.get(driver);
  if (!tr || tr.t.length === 0) return null;
  const n = tr.t.length;
  if (t <= tr.t[0]!) return { x: tr.x[0]!, y: tr.y[0]! };
  if (t >= tr.t[n - 1]!) return { x: tr.x[n - 1]!, y: tr.y[n - 1]! };
  // Binary search for the last sample at or before t.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (tr.t[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const t0 = tr.t[lo]!;
  const t1 = tr.t[hi]!;
  const k = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  return { x: tr.x[lo]! + (tr.x[hi]! - tr.x[lo]!) * k, y: tr.y[lo]! + (tr.y[hi]! - tr.y[lo]!) * k };
}

/**
 * A local session clock that runs smoothly between server clock messages.
 * Small disagreements with the server are corrected gradually; big ones (seek, speed change) snap.
 */
const clock = { base: 0, wall: 0, speed: 1, playing: false, end: 0 };

export function syncClock(server: { t: number; speed: number; playing: boolean; end: number }) {
  const now = performance.now();
  const predicted = clockNow(now);
  const err = server.t - predicted;
  const snap =
    !clock.playing ||
    !server.playing ||
    clock.speed !== server.speed ||
    Math.abs(err) > 1500 * server.speed;
  clock.base = snap ? server.t : predicted + err * 0.25;
  clock.wall = now;
  clock.speed = server.speed;
  clock.playing = server.playing;
  clock.end = server.end;
}

export function clockNow(now = performance.now()): number {
  if (!clock.playing) return clock.base;
  return Math.min(clock.end || Infinity, clock.base + (now - clock.wall) * clock.speed);
}

/**
 * How far behind the clock cars are drawn, in session ms. Samples are released by the server
 * in 100 ms batches, so at higher speeds each batch covers more session time.
 */
export function renderLag(): number {
  return 450 + 150 * clock.speed;
}
