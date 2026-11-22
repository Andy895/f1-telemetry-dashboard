import { useDashboard } from '../state';

export function RaceControl() {
  const feed = useDashboard((s) => s.race_control);
  const drivers = useDashboard((s) => s.drivers);
  const latest = [...feed].reverse().slice(0, 14);

  return (
    <section className="rc">
      <h2>Race control</h2>
      {latest.length === 0 && <p className="muted">No messages yet</p>}
      {latest.map((m, i) => {
        const time = typeof m.date === 'string' ? new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const driver = m.driver_number ? drivers[String(m.driver_number)]?.name_acronym : null;
        return (
          <div className={`rc-item cat-${String(m.category)} rcf-${String(m.flag ?? '').replace(/\s+/g, '-')}`} key={`${String(m.date)}-${i}`}>
            <span className="muted">
              {m.lap_number ? `L${String(m.lap_number)} · ` : ''}
              {time}
              {driver ? ` · ${driver}` : ''}
            </span>
            <span>{String(m.message ?? '')}</span>
          </div>
        );
      })}
    </section>
  );
}
