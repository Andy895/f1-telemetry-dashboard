import { useEffect, useRef, useState } from 'react';
import { clockNow, renderLag } from '../motion';
import { toggleFocus, useDashboard } from '../state';
import { telemetryAt, type CarSample } from '../telemetry';

const TRACE_MS = 30_000;

/** Live speed, throttle, brake, gear and DRS for up to two drivers picked in the timing tower. */
export function DriverFocus() {
  const focus = useDashboard((s) => s.focus);
  const drivers = useDashboard((s) => s.drivers);
  const [, setTick] = useState(0);

  // Redraw ~10 times a second, in step with the (buffered) track map.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const t = clockNow() - renderLag();
  return (
    <section className="panel focus">
      <h2>Driver focus</h2>
      {focus.length === 0 && <p className="muted small">Click up to two drivers in the timing tower to follow their telemetry.</p>}
      {focus.map((num) => {
        const d = drivers[String(num)];
        const { now, trace } = telemetryAt(String(num), t, TRACE_MS);
        return (
          <div className="focus-row" key={num}>
            <button className="focus-name ghost" title="Stop following" onClick={() => toggleFocus(num)}>
              <i className="team" style={{ background: d ? `#${d.team_colour}` : '#888' }} />
              {d?.name_acronym ?? num}
            </button>
            {now ? (
              <>
                <div className="focus-speed">
                  <strong>{now.speed}</strong>
                  <span className="muted">km/h</span>
                </div>
                <div className="focus-gear">
                  <span className="muted">GEAR</span>
                  <strong>{now.gear || 'N'}</strong>
                </div>
                <div className="focus-pedals">
                  <Bar label="THR" value={now.throttle} className="thr" />
                  <Bar label="BRK" value={now.brake > 0 ? 100 : 0} className="brk" />
                </div>
                <span className={`drs-badge ${now.drs >= 10 ? 'open' : now.drs === 8 ? 'armed' : ''}`}>DRS</span>
                <Trace samples={trace} colour={d ? `#${d.team_colour}` : '#888'} end={t} />
              </>
            ) : (
              <span className="muted small">Loading telemetry…</span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Bar({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="pedal">
      <span className="muted">{label}</span>
      <div className="pedal-track">
        <div className={`pedal-fill ${className}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** Speed over the last 30 seconds. */
function Trace({ samples, colour, end }: { samples: CarSample[]; colour: string; end: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr) c.width = w * dpr;
    if (c.height !== h * dpr) c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const x = (t: number) => ((t - (end - TRACE_MS)) / TRACE_MS) * w;
    const y = (v: number) => h - 2 - (Math.min(v, 360) / 360) * (h - 4);
    // Braking zones as a faint band along the bottom.
    g.fillStyle = 'rgba(255, 80, 80, 0.35)';
    for (const s of samples) if (s.brake > 0) g.fillRect(x(s.t) - 1, h - 4, 3, 4);
    g.strokeStyle = colour;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    samples.forEach((s, i) => (i ? g.lineTo(x(s.t), y(s.speed)) : g.moveTo(x(s.t), y(s.speed))));
    g.stroke();
  });
  return <canvas ref={ref} className="trace" aria-label="Speed over the last 30 seconds" />;
}
