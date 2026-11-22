import { Header } from './components/Header';
import { RaceControl } from './components/RaceControl';
import { SessionPicker } from './components/SessionPicker';
import { TimingTower } from './components/TimingTower';
import { TrackMap } from './components/TrackMap';
import { useDashboard } from './state';

export function App() {
  const session = useDashboard((s) => s.session);
  const status = useDashboard((s) => s.status);
  const connected = useDashboard((s) => s.connected);

  if (!connected) return <div className="splash">Connecting to the dashboard server…</div>;
  if (!session || status.status === 'loading') {
    return (
      <div className="splash">
        <SessionPicker />
        {status.status === 'loading' && <p className="muted">{status.message}… (first load of a race takes about a minute)</p>}
        {status.status === 'error' && <p className="error">{status.message}</p>}
      </div>
    );
  }

  return (
    <div className="layout">
      <Header />
      <TimingTower />
      <TrackMap />
      <RaceControl />
    </div>
  );
}
