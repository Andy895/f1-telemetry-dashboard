import { COMPOUND_COLOUR } from '../format';
import { useDashboard } from '../state';

export function PitStops() {
  const drivers = useDashboard((s) => s.drivers);
  const pit = useDashboard((s) => s.pit);
  const stints = useDashboard((s) => s.stints);
  const latest = [...pit].reverse().slice(0, 6);

  return (
    <section className="panel pits">
      <h2>Pit stops</h2>
      {latest.length === 0 && <p className="muted small">No stops yet</p>}
      {latest.map((p, i) => {
        const id = String(p.driver_number);
        const d = drivers[id];
        const stint = stints[id];
        // The current stint is the tyre fitted at this stop if it started after the stop's lap.
        const fitted = stint && Number(stint.lap_start) > Number(p.lap_number) ? String(stint.compound ?? '') : '';
        const stop = typeof p.stop_duration === 'number' ? `${p.stop_duration.toFixed(1)}s stop` : '';
        const lane = typeof p.pit_duration === 'number' ? `${p.pit_duration.toFixed(1)}s lane` : '';
        return (
          <div className="pit" key={`${id}-${String(p.date)}-${i}`}>
            <span className="muted">L{String(p.lap_number)}</span>
            <span className="chip">
              {d && <i className="team" style={{ background: `#${d.team_colour}` }} />}
              {d?.name_acronym ?? id}
            </span>
            <span className="muted small">{[stop, lane].filter(Boolean).join(' · ')}</span>
            {fitted && (
              <i className="compound" style={{ borderColor: COMPOUND_COLOUR[fitted] ?? '#888' }}>
                {fitted[0]}
              </i>
            )}
          </div>
        );
      })}
    </section>
  );
}
