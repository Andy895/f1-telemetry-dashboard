import { Battles } from './components/Battles';
import { DriverFocus } from './components/DriverFocus';
import { GapChart } from './components/GapChart';
import { Header } from './components/Header';
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
  if (!session || status.status === 'loading') {
    return (
      <div className="splash">
        <SessionPicker />
        {status.status === 'loading' && <p className="muted">{status.message}… (first load of a race takes about a minute)</p>}
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
