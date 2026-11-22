import { useEffect, useState } from 'react';
import { formatClock, trackStatus } from '../format';
import { clockNow } from '../motion';
import { send, setDelay, useDashboard } from '../state';

const SPEEDS = [1, 2, 5, 10];
/**
 * Starting point for F1 TV: OpenF1 is ~3 s behind the track, and the F1 TV stream is usually
 * further behind than that. Nudge with -1/+1 until flags and position changes match the TV.
 */
const F1TV_DELAY_S = 30;

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
      <div className="header-row">
      <div className="title">
        <span className="gp">{session.country_name}</span>
        <span className="muted">{session.session_name} · {session.year}</span>
      </div>
      {(session.session_type === 'Race' || session.session_type === 'Sprint') && leaderLap > 0 && (
        <div className="lap">
          LAP <strong>{leaderLap}</strong>
          {totalLaps ? `/${totalLaps}` : ''}
        </div>
      )}
      <div className={`flag flag-${status}`}>{status === 'SC' ? 'SAFETY CAR' : status === 'VSC' ? 'VIRTUAL SC' : status}</div>
      {weather && (
        <div className="weather muted">
          Air {String(weather.air_temperature)}° · Track {String(weather.track_temperature)}°{weather.rainfall ? ' · Rain' : ''}
        </div>
      )}
      </div>
      {clock && (
        <div className="controls">
          {clock.mode === 'live' ? (
            <>
              <LiveBadge />
              <span className="clock">{formatClock(now - clock.start)}</span>
              <span className="spacer" />
            </>
          ) : (
            <>
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
            </>
          )}
          <span className="delay muted" title="Hold the dashboard back to match your TV stream">
            Delay
            <button onClick={() => setDelay(clock.delayMs - 1000)}>−1</button>
            <span className="delay-value">{Math.round(clock.delayMs / 1000)}s</span>
            <button onClick={() => setDelay(clock.delayMs + 1000)}>+1</button>
            <button className={Math.round(clock.delayMs / 1000) === F1TV_DELAY_S ? 'active' : ''} onClick={() => setDelay(F1TV_DELAY_S * 1000)}>
              F1 TV
            </button>
          </span>
          <button className="ghost" onClick={() => useDashboard.setState({ session: null })}>
            Change
          </button>
        </div>
      )}
    </header>
  );
}

/** Re-render a few times a second so the clock and slider move smoothly. */
function useTicker(clock: ReturnType<typeof useDashboard.getState>['clock']) {
  const [t, setT] = useState(() => clockNow());
  useEffect(() => {
    setT(clockNow());
    const id = setInterval(() => setT(clockNow()), 250);
    return () => clearInterval(id);
  }, [clock]);
  return t;
}

function LiveBadge() {
  const live = useDashboard((s) => s.live);
  const label = live.feed === 'connected' ? 'LIVE' : live.feed === 'reconnecting' || live.feed === 'connecting' ? 'RECONNECTING' : 'FEED DOWN';
  return (
    <span className={`live-badge feed-${live.feed}`} title={live.detail}>
      ● {label}
    </span>
  );
}
