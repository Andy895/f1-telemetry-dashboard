import type { TrackOutline } from '../../server/src/types';

export interface Orientation {
  /** Rotate a raw OpenF1 point into screen space (y down), with the track's long axis vertical. */
  project: (x: number, y: number) => [number, number];
  path: string;
  viewBox: string;
  size: number;
}

/**
 * Turn the circuit so its longest direction runs top to bottom, which suits a portrait monitor.
 * The long axis comes from the principal component of the outline's points.
 */
export function orientTrack(track: TrackOutline, pad = 0.06): Orientation {
  const pts = track.points;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const major = 0.5 * Math.atan2(2 * sxy, sxx - syy); // angle of the long axis
  const phi = Math.PI / 2 - major; // turn it to vertical
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // OpenF1 y grows upwards; screen y grows downwards, so negate y after rotating.
  const project = (x: number, y: number): [number, number] => {
    const dx = x - mx;
    const dy = y - my;
    return [dx * cos - dy * sin, -(dx * sin + dy * cos)];
  };

  const proj = pts.map(([x, y]) => project(x, y));
  const xs = proj.map((p) => p[0]);
  const ys = proj.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const size = Math.max(maxX - minX, maxY - minY);
  const p = size * pad;
  return {
    project,
    path: proj.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(0)} ${y.toFixed(0)}`).join(' ') + ' Z',
    viewBox: `${minX - p} ${minY - p} ${maxX - minX + 2 * p} ${maxY - minY + 2 * p}`,
    size,
  };
}
