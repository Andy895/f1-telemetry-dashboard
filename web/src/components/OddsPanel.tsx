import { useEffect, useMemo, useState } from 'react';
import type { OddsPoint } from '../../../server/src/types';
import { clockNow } from '../motion';
import { useDashboard } from '../state';

const LIST = 6;
const LINES = 5;
const CHANGE_MS = 10 * 60_000;
const W = 340;
const H = 150;
const PAD = { l: 36, r: 34, t: 8, b: 8 };

/** Price at time t: the last point at or before t. */
function priceAt(series: OddsPoint[] | undefined, t: number): number | null {
  if (!series || series.length === 0 || series[0]![0] > t) return null;
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid]![0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return series[lo]![1];
}

const SOURCE_NAME = { kalshi: 'Kalshi', polymarket: 'Polymarket' } as const;

/**
 * Race-winner chances implied by prediction-market prices, kept in step with the TV picture
 * by the same clock as everything else. Read-only: market prices, not betting advice.
 */
export function OddsPanel() {
  const odds = useDashboard((s) => s.odds);
  const note = useDashboard((s) => s.oddsNote);
  const drivers = useDashboard((s) => s.drivers);
  const [t, setT] = useState(() => clockNow());

  useEffect(() => {
    const id = setInterval(() => setT(clockNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => {
    if (!odds) return null;
    const rows = Object.entries(odds.series)
      .filter(([id]) => drivers[id])
      .map(([id, series]) => {
        const p = priceAt(series, t);
        const before = priceAt(series, t - CHANGE_MS);
        return { id, d: drivers[id]!, p, change: p !== null && before !== null ? p - before : null, series };
      })
      .filter((r): r is typeof r & { p: number } => r.p !== null)
      .sort((a, b) => b.p - a.p);
    if (rows.length === 0) return { rows, chart: null };

    // Chart: the top 5 from the first price up to now.
    const top = rows.slice(0, LINES);
    const start = Math.min(...top.map((r) => r.series[0]![0]));
    const end = Math.max(t, start + 60_000);
    const maxP = Math.max(...top.flatMap((r) => r.series.filter((pt) => pt[0] <= t).map((pt) => pt[1])));
    const yMax = maxP > 0.5 ? 1 : maxP > 0.25 ? 0.5 : 0.25;
    const x = (ts: number) => PAD.l + ((ts - start) / (end - start)) * (W - PAD.l - PAD.r);
    const y = (p: number) => H - PAD.b - (Math.min(p, yMax) / yMax) * (H - PAD.t - PAD.b);
    const seenTeam = new Set<string>();
    const lines = top.map((r) => {
      const dashed = seenTeam.has(r.d.team_name);
      seenTeam.add(r.d.team_name);
      const pts = r.series.filter((pt) => pt[0] <= t);
      // Step line: a price holds until the next trade.
      let path = '';
      pts.forEach((pt, i) => {
        path += i === 0 ? `M${x(pt[0]).toFixed(1)} ${y(pt[1]).toFixed(1)}` : `H${x(pt[0]).toFixed(1)}V${y(pt[1]).toFixed(1)}`;
      });
      path += `H${x(t).toFixed(1)}`;
      return { id: r.id, code: r.d.name_acronym, colour: `#${r.d.team_colour}`, dashed, path, endY: y(r.p) };
    });
    const labels = [...lines].sort((a, b) => a.endY - b.endY).map((l) => ({ id: l.id, y: l.endY }));
    for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 11);
    // Long-shots all sit near 0%: push their labels back up so the bottom ones stay inside the chart.
    for (let i = labels.length - 1; i >= 0; i--) labels[i]!.y = Math.min(labels[i]!.y, i === labels.length - 1 ? H - 4 : labels[i + 1]!.y - 11);
    const labelY = new Map(labels.map((l) => [l.id, l.y]));
    const yTicks = [0, yMax / 2, yMax];
    return { rows, chart: { lines, labelY, yTicks, y, endX: x(t) } };
  }, [odds, drivers, t]);

  return (
    <section className="panel odds">
      <h2>
        Race winner chance
        {odds && (
          <a className="odds-source" href={odds.url} target="_blank" rel="noreferrer" title={odds.title}>
            {SOURCE_NAME[odds.source]} market prices
          </a>
        )}
      </h2>
      {!odds ? (
        <p className="muted small">{note ?? 'Looking for a race-winner market…'}</p>
      ) : !view || view.rows.length === 0 ? (
        <p className="muted small">No trades yet at this point of the session.</p>
      ) : (
        <div className="odds-body">
          <ol className="odds-list">
            {view.rows.slice(0, LIST).map((r) => (
              <li key={r.id}>
                <i className="team" style={{ background: `#${r.d.team_colour}` }} />
                <span className="odds-code">{r.d.name_acronym}</span>
                <span className="odds-bar">
                  <span style={{ width: `${Math.max(1, r.p * 100)}%`, background: `#${r.d.team_colour}` }} />
                </span>
                <strong className="odds-pct">{formatPct(r.p)}</strong>
                <span className={`odds-change ${r.change === null || Math.abs(r.change) < 0.005 ? '' : r.change > 0 ? 'up' : 'down'}`} title="Change over the last 10 minutes">
                  {formatChange(r.change)}
                </span>
              </li>
            ))}
          </ol>
          {view.chart && (
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Win chance over time for the top five">
              <g className="grid">
                {view.chart.yTicks.map((p) => (
                  <g key={p}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={view.chart!.y(p)} y2={view.chart!.y(p)} />
                    <text x={PAD.l - 5} y={view.chart!.y(p) + 3.5} textAnchor="end">
                      {Math.round(p * 100)}%
                    </text>
                  </g>
                ))}
              </g>
              {view.chart.lines.map((l) => (
                <path key={l.id} d={l.path} fill="none" stroke={l.colour} strokeWidth={2} strokeDasharray={l.dashed ? '5 3' : undefined} strokeLinejoin="round" />
              ))}
              {view.chart.lines.map((l) => (
                <g key={`${l.id}-end`}>
                  <circle cx={view.chart!.endX} cy={l.endY} r={3} fill={l.colour} stroke="var(--panel)" strokeWidth={1.5} />
                  <text className="end-label" x={W - PAD.r + 6} y={(view.chart!.labelY.get(l.id) ?? l.endY) + 3.5}>
                    {l.code}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      )}
    </section>
  );
}

function formatPct(p: number): string {
  const v = p * 100;
  return v < 1 ? '<1%' : `${Math.round(v)}%`;
}

function formatChange(c: number | null): string {
  if (c === null || Math.abs(c) < 0.005) return '';
  return `${c > 0 ? '▲' : '▼'}${Math.round(Math.abs(c) * 100)}`;
}
