import { useMemo } from 'react';
import { useDashboard } from '../state';

const W = 560;
const H = 220;
const PAD = { l: 34, r: 44, t: 10, b: 22 };
const SHOW = 10;

/**
 * Gap to the leader at each lap for the top 10, leader along the top edge.
 * Lines that fall away show who is losing time; lines that bunch show a train or undercut.
 */
export function GapChart() {
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const history = useDashboard((s) => s.gap_history);

  const chart = useMemo(() => {
    const top = Object.values(position)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .slice(0, SHOW)
      .map((p) => String(p.driver_number))
      .filter((id) => drivers[id] && (history[id]?.length ?? 0) > 1);
    if (top.length === 0) return null;

    const allPts = top.flatMap((id) => history[id]!);
    const maxLap = Math.max(...allPts.map((p) => p[0]));
    const minLap = Math.max(1, maxLap - 40); // last 40 laps keeps the recent story readable
    const visible = allPts.filter((p) => p[0] >= minLap);
    const maxGap = Math.min(90, Math.max(5, ...visible.map((p) => p[1])));
    const yStep = maxGap > 40 ? 20 : maxGap > 15 ? 10 : 5;
    const yMax = Math.ceil(maxGap / yStep) * yStep;
    const x = (lap: number) => PAD.l + ((lap - minLap) / Math.max(1, maxLap - minLap)) * (W - PAD.l - PAD.r);
    const y = (gap: number) => PAD.t + (Math.min(gap, yMax) / yMax) * (H - PAD.t - PAD.b);

    // Teammates share a colour, so draw the second driver of each team dashed.
    const seenTeam = new Set<string>();
    const lines = top.map((id) => {
      const d = drivers[id]!;
      const dashed = seenTeam.has(d.team_name);
      seenTeam.add(d.team_name);
      const pts = history[id]!.filter((p) => p[0] >= minLap);
      const last = pts.at(-1)!;
      return {
        id,
        code: d.name_acronym,
        colour: `#${d.team_colour}`,
        dashed,
        path: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' '),
        end: { x: x(last[0]), y: y(last[1]), gap: last[1] },
      };
    });

    // Nudge end labels apart so they don't overlap.
    const labels = [...lines].sort((a, b) => a.end.y - b.end.y).map((l) => ({ id: l.id, y: l.end.y }));
    for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 11);
    const labelY = new Map(labels.map((l) => [l.id, l.y]));

    const yTicks = Array.from({ length: yMax / yStep + 1 }, (_, i) => i * yStep);
    const lapStep = maxLap - minLap > 20 ? 10 : 5;
    const xTicks = Array.from({ length: Math.floor((maxLap - minLap) / lapStep) + 1 }, (_, i) => Math.ceil(minLap / lapStep) * lapStep + i * lapStep).filter(
      (l) => l <= maxLap,
    );
    return { lines, labelY, yTicks, xTicks, x, y };
  }, [drivers, position, history]);

  return (
    <section className="panel gapchart">
      <h2>Gap to leader · top 10 · seconds</h2>
      {!chart ? (
        <p className="muted small">Builds up lap by lap</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gap to the leader by lap for the top 10 drivers">
          <g className="grid">
            {chart.yTicks.map((g) => (
              <g key={g}>
                <line x1={PAD.l} x2={W - PAD.r} y1={chart.y(g)} y2={chart.y(g)} />
                <text x={PAD.l - 6} y={chart.y(g) + 3.5} textAnchor="end">
                  {g === 0 ? 'Ldr' : `+${g}`}
                </text>
              </g>
            ))}
            {chart.xTicks.map((l) => (
              <text key={l} x={chart.x(l)} y={H - 6} textAnchor="middle">
                L{l}
              </text>
            ))}
          </g>
          {chart.lines.map((l) => (
            <path key={l.id} d={l.path} fill="none" stroke={l.colour} strokeWidth={2} strokeDasharray={l.dashed ? '5 3' : undefined} strokeLinejoin="round">
              <title>
                {l.code}: +{l.end.gap.toFixed(1)}s
              </title>
            </path>
          ))}
          {chart.lines.map((l) => (
            <g key={`${l.id}-label`}>
              <circle cx={l.end.x} cy={l.end.y} r={3} fill={l.colour} stroke="var(--panel)" strokeWidth={1.5} />
              <text className="end-label" x={W - PAD.r + 6} y={(chart.labelY.get(l.id) ?? l.end.y) + 3.5}>
                {l.code}
              </text>
            </g>
          ))}
        </svg>
      )}
    </section>
  );
}
