import { useDashboard } from '../state';

/** Cars within DRS range (under 1 s) of the car ahead, closest first. */
export function Battles() {
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const intervals = useDashboard((s) => s.intervals);

  const byPos = new Map(Object.values(position).map((p) => [Number(p.position), String(p.driver_number)]));
  const battles = [...byPos.entries()]
    .filter(([pos]) => pos > 1)
    .map(([pos, id]) => ({ pos, id, ahead: byPos.get(pos - 1), gap: intervals[id]?.interval }))
    .filter((b): b is { pos: number; id: string; ahead: string; gap: number } => typeof b.gap === 'number' && b.gap < 1 && !!b.ahead)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6);

  return (
    <section className="panel battles">
      <h2>Battles · within 1 s</h2>
      {battles.length === 0 && <p className="muted small">No cars within a second</p>}
      {battles.map((b) => (
        <div className="battle" key={b.id}>
          <span className="muted">P{b.pos}</span>
          {chip(b.id)}
          <span className="muted">on</span>
          {chip(b.ahead)}
          <span className="num gap">{b.gap.toFixed(3)}</span>
        </div>
      ))}
    </section>
  );

  function chip(id: string) {
    const d = drivers[id];
    if (!d) return <span>#{id}</span>;
    return (
      <span className="chip">
        <i className="team" style={{ background: `#${d.team_colour}` }} />
        {d.name_acronym}
      </span>
    );
  }
}
