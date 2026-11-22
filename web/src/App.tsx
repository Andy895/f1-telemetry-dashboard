import { Battles } from './components/Battles';
import { DriverFocus } from './components/DriverFocus';
import { GapChart } from './components/GapChart';
import { Header } from './components/Header';
import { OddsPanel } from './components/OddsPanel';
import { PitStops } from './components/PitStops';
import { RaceControl } from './components/RaceControl';
import { SessionPicker } from './components/SessionPicker';
import { TimingTower } from './components/TimingTower';
import { TrackMap } from './components/TrackMap';
import { TyreStrategy } from './components/TyreStrategy';
import { useDashboard } from './state';

export function App() {
  const session = useDashboard((s) => s.session);
  const status = useDashboard((s) => s.status);
  const connected = useDashboard((s) => s.connected);

  if (!connected) return <div className="splash">Connecting to the dashboard server…</div>;
  if (status.status === 'loading') {
    return (
      <div className="splash">
        <LoadingBar message={status.message} progress={status.progress} />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="splash">
        <SessionPicker />
        {status.status === 'error' && <p className="error">{status.message}</p>}
      </div>
    );
  }

  // Laid out for a portrait 1080x1920 monitor: track map, gap chart and driver focus on the
  // left; timing tower, strategy, battles, pit stops and race control on the right.
  return (
    <div className="layout">
      <Header />
      <div className="main">
        <TrackMap />
        <GapChart />
        <OddsPanel />
        <DriverFocus />
      </div>
      <TimingTower />
      <div className="side">
        <TyreStrategy />
        <Battles />
        <PitStops />
        <RaceControl />
      </div>
    </div>
  );
}

/** Replay downloads report how far along they are; live loads don't, so their bar just pulses. */
function LoadingBar({ message, progress }: { message?: string; progress?: number }) {
  const known = typeof progress === 'number';
  const pct = known ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0;
  return (
    <div className="loading">
      <div className="loading-head">
        <span>{message ?? 'Loading'}…</span>
        {known && <strong>{pct}%</strong>}
      </div>
      <div className={`loading-track${known ? '' : ' indeterminate'}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined}>
        <div className="loading-fill" style={known ? { width: `${pct}%` } : undefined} />
      </div>
      <p className="muted small">The first load of a race takes about a minute. After that it is saved and opens in seconds.</p>
    </div>
  );
}
