/** Rolling car telemetry for focused drivers, kept outside React state (it arrives ~4 Hz per car). */
export interface CarSample {
  t: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  drs: number;
  rpm: number;
}

const MAX = 2400; // ~10 minutes at 3.7 Hz
const buffers = new Map<string, CarSample[]>();

export function resetTelemetry() {
  buffers.clear();
}

export function addCarSample(driver: string, s: CarSample) {
  let buf = buffers.get(driver);
  if (!buf) buffers.set(driver, (buf = []));
  const last = buf.at(-1);
  if (last && s.t < last.t) {
    // Backfill after a seek can arrive out of order; insert in place.
    const i = buf.findIndex((x) => x.t > s.t);
    buf.splice(i < 0 ? buf.length : i, 0, s);
  } else if (last && s.t === last.t) {
    buf[buf.length - 1] = s;
  } else {
    buf.push(s);
  }
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

/** The latest sample at or before `t`, and the samples in the `windowMs` before it. */
export function telemetryAt(driver: string, t: number, windowMs: number): { now: CarSample | null; trace: CarSample[] } {
  const buf = buffers.get(driver) ?? [];
  let hi = buf.length;
  let lo = 0;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buf[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  const end = lo; // first index after t
  let start = end;
  while (start > 0 && buf[start - 1]!.t >= t - windowMs) start--;
  return { now: end > 0 ? buf[end - 1]! : null, trace: buf.slice(start, end) };
}
