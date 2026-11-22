import { COMPOUND_COLOUR, formatGap, formatLapTime } from '../format';
import { useDashboard } from '../state';

export function TimingTower() {
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const intervals = useDashboard((s) => s.intervals);
  const laps = useDashboard((s) => s.laps);
  const stints = useDashboard((s) => s.stints);

  const rows = Object.values(position)
    .filter((p) => drivers[String(p.driver_number)])
    .sort((a, b) => Number(a.position) - Number(b.position));

  return (
    <section className="tower">
      <div className="tower-head muted">
        <span>POS</span>
        <span>DRIVER</span>
        <span className="num">GAP</span>
        <span className="num">INT</span>
        <span className="num">LAST</span>
        <span>TYRE</span>
      </div>
      {rows.map((p) => {
        const id = String(p.driver_number);
        const d = drivers[id]!;
        const iv = intervals[id];
        const lap = laps[id];
        const stint = stints[id];
        const lapNo = Number(lap?.lap_number ?? 0);
        const age = stint ? Number(stint.tyre_age_at_start ?? 0) + Math.max(0, lapNo - Number(stint.lap_start ?? lapNo)) : null;
        const compound = String(stint?.compound ?? '');
        return (
          <div className="tower-row" key={id}>
            <span className="pos">{String(p.position)}</span>
            <span className="driver">
              <i className="team" style={{ background: `#${d.team_colour}` }} />
              {d.name_acronym}
            </span>
            <span className="num">{p.position === 1 ? 'Leader' : formatGap(iv?.gap_to_leader)}</span>
            <span className="num muted">{p.position === 1 ? '' : formatGap(iv?.interval)}</span>
            <span className="num muted">{formatLapTime(lap?.lap_duration)}</span>
            <span className="tyre">
              {compound && (
                <>
                  <i className="compound" style={{ borderColor: COMPOUND_COLOUR[compound] ?? '#888' }}>
                    {compound[0]}
                  </i>
                  <span className="muted">{age}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
