import { useEffect, useState } from 'react';
import { formatClock, trackStatus } from '../format';
import { send, sessionNow, useDashboard } from '../state';

const SPEEDS = [1, 2, 5, 10];

export function Header() {
  const session = useDashboard((s) => s.session)!;
  const clock = useDashboard((s) => s.clock);
  const totalLaps = useDashboard((s) => s.totalLaps);
  const position = useDashboard((s) => s.position);
  const laps = useDashboard((s) => s.laps);
  const feed = useDashboard((s) => s.race_control);
  const weather = useDashboard((s) => s.weather);
  const now = useTicker(clock);

  const leader = Object.values(position).find((p) => p.position === 1);
  const leaderLap = leader ? Number(laps[String(leader.driver_number)]?.lap_number ?? 0) : 0;
  const status = trackStatus(feed);

  return (
    <header className="header">
      <div className="title">
        <span className="gp">{session.country_name}</span>
        <span className="muted">{session.session_name} · {session.year}</span>
      </div>
      {totalLaps && session.session_type === 'Race' && (
        <div className="lap">
          LAP <strong>{Math.max(leaderLap, 1)}</strong>/{totalLaps}
        </div>
      )}
      <div className={`flag flag-${status}`}>{status === 'SC' ? 'SAFETY CAR' : status === 'VSC' ? 'VIRTUAL SC' : status}</div>
      {weather && (
        <div className="weather muted">
          Air {String(weather.air_temperature)}° · Track {String(weather.track_temperature)}°{weather.rainfall ? ' · Rain' : ''}
        </div>
      )}
      <div className="spacer" />
      {clock && (
        <div className="controls">
          <button onClick={() => send({ type: clock.playing ? 'pause' : 'play' })}>{clock.playing ? 'Pause' : 'Play'}</button>
          {SPEEDS.map((s) => (
            <button key={s} className={clock.speed === s ? 'active' : ''} onClick={() => send({ type: 'speed', speed: s })}>
              {s}x
            </button>
          ))}
          <input
            className="seek"
            type="range"
            min={clock.start}
            max={clock.end}
            step={1000}
            value={now}
            onChange={(e) => send({ type: 'seek', t: Number(e.target.value) })}
          />
          <span className="clock">{formatClock(now - clock.start)}</span>
          <label className="delay muted" title="Hold the dashboard back to match your TV stream">
            Delay
            <input
              type="number"
              min={0}
              max={120}
              value={Math.round(clock.delayMs / 1000)}
              onChange={(e) => send({ type: 'delay', delayMs: Number(e.target.value) * 1000 })}
            />
            s
          </label>
          <button className="ghost" onClick={() => useDashboard.setState({ session: null })}>
            Change race
          </button>
        </div>
      )}
    </header>
  );
}

/** Re-render a few times a second so the clock and slider move smoothly. */
function useTicker(clock: ReturnType<typeof useDashboard.getState>['clock']) {
  const [t, setT] = useState(() => sessionNow(clock));
  useEffect(() => {
    setT(sessionNow(clock));
    const id = setInterval(() => setT(sessionNow(clock)), 250);
    return () => clearInterval(id);
  }, [clock]);
  return t;
}
