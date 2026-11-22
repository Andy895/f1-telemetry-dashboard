import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../../server/src/types';
import { send } from '../state';

const FIRST_YEAR = 2023;

export function SessionPicker() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSessions(null);
    setError(null);
    fetch(`/api/sessions?year=${year}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list: SessionInfo[]) => setSessions(list.filter((s) => Date.parse(s.date_start) < Date.now()).reverse()))
      .catch((e: Error) => setError(e.message));
  }, [year]);

  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);

  return (
    <div className="picker">
      <h1>Pick a session to replay</h1>
      <div className="years">
        {years.map((y) => (
          <button key={y} className={y === year ? 'active' : ''} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>
      {error && <p className="error">Could not load sessions: {error}</p>}
      {!sessions && !error && <p className="muted">Loading…</p>}
      <div className="session-list">
        {sessions?.map((s) => (
          <button key={s.session_key} className={`session ${s.session_type === 'Race' ? 'race' : ''}`} onClick={() => send({ type: 'load', session_key: s.session_key })}>
            <strong>{s.country_name}</strong>
            <span>{s.session_name}</span>
            <span className="muted">{new Date(s.date_start).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
