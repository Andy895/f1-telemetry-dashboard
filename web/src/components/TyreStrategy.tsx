import { COMPOUND_COLOUR } from '../format';
import { useDashboard } from '../state';

/** One bar per driver across the race distance, coloured by tyre compound for each stint. */
export function TyreStrategy() {
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const laps = useDashboard((s) => s.laps);
  const history = useDashboard((s) => s.stint_history);
  const knownTotal = useDashboard((s) => s.totalLaps);
  // Live, the race distance isn't in the data yet, so scale to the laps run so far.
  const lapsSoFar = Math.max(1, ...Object.values(laps).map((l) => Number(l.lap_number) || 0));
  const totalLaps = knownTotal ?? lapsSoFar;

  const rows = Object.values(position)
    .filter((p) => drivers[String(p.driver_number)])
    .sort((a, b) => Number(a.position) - Number(b.position));

  return (
    <section className="panel strategy">
      <h2>Tyre strategy</h2>
      {rows.map((p) => {
        const id = String(p.driver_number);
        const current = Number(laps[id]?.lap_number ?? 0);
        const stints = history[id] ?? [];
        return (
          <div className="strat-row" key={id}>
            <span className="strat-name">{drivers[id]!.name_acronym}</span>
            <div className="strat-bar">
              {stints.map((st) => {
                const from = Number(st.lap_start ?? 1);
                // In a replay OpenF1 already knows when the stint ends; never draw past the current lap.
                const to = Math.min(Number(st.lap_end ?? current), current);
                if (!(to >= from)) return null;
                const compound = String(st.compound ?? '');
                return (
                  <i
                    key={String(st.stint_number)}
                    title={`${compound} laps ${from}-${to}`}
                    style={{
                      left: `${((from - 1) / totalLaps) * 100}%`,
                      width: `${((to - from + 1) / totalLaps) * 100}%`,
                      background: COMPOUND_COLOUR[compound] ?? '#666',
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
