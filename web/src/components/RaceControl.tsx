import { useDashboard } from '../state';

export function RaceControl() {
  const feed = useDashboard((s) => s.race_control);
  const drivers = useDashboard((s) => s.drivers);
  const latest = [...feed].reverse().slice(0, 8);

  return (
    <section className="panel rc">
      <h2>Race control</h2>
      {latest.length === 0 && <p className="muted small">No messages yet</p>}
      {latest.map((m, i) => {
        const driver = m.driver_number ? drivers[String(m.driver_number)]?.name_acronym : null;
        return (
          <div className={`rc-item cat-${String(m.category)} rcf-${String(m.flag ?? '').replace(/\s+/g, '-')}`} key={`${String(m.date)}-${i}`}>
            <span className="muted lapno">{m.lap_number ? `L${String(m.lap_number)}` : ''}</span>
            <span className="msg">
              {driver && <b>{driver} · </b>}
              {String(m.message ?? '')}
            </span>
          </div>
        );
      })}
    </section>
  );
}
