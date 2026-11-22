import { useEffect, useMemo, useRef } from 'react';
import { carAt, clockNow, renderLag } from '../motion';
import { useDashboard } from '../state';
import { orientTrack } from '../track';

export function TrackMap() {
  const track = useDashboard((s) => s.track);
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const focus = useDashboard((s) => s.focus);
  const dotRefs = useRef(new Map<string, SVGGElement>());

  const view = useMemo(() => (track ? orientTrack(track) : null), [track]);

  // Draw every car at the same buffered session time, every animation frame.
  useEffect(() => {
    if (!view) return;
    let raf = 0;
    const frame = () => {
      const t = clockNow() - renderLag();
      for (const [driver, el] of dotRefs.current) {
        const p = carAt(driver, t);
        if (!p) {
          el.style.display = 'none';
          continue;
        }
        const [x, y] = view.project(p.x, p.y);
        el.style.display = '';
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  if (!view) return <section className="map muted">No track outline for this session</section>;

  const r = view.size / 110;
  // Draw the leaders last so they sit on top, and focused drivers above everyone.
  const rank = (id: string) => (focus.includes(Number(id)) ? -1 : Number(position[id]?.position ?? 99));
  const order = Object.keys(drivers).sort((a, b) => rank(b) - rank(a));

  return (
    <section className="map">
      <svg viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet">
        <path d={view.path} className="track-outer" strokeWidth={r * 2.2} />
        <path d={view.path} className="track-inner" strokeWidth={r * 1.4} />
        {order.map((id) => {
          const d = drivers[id]!;
          return (
            <g
              key={id}
              ref={(el) => {
                if (el) dotRefs.current.set(id, el);
                else dotRefs.current.delete(id);
              }}
              style={{ display: 'none' }}
            >
              {focus.includes(Number(id)) && <circle r={r * 1.7} fill="none" stroke="#fff" strokeWidth={r * 0.25} />}
              <circle r={r} fill={`#${d.team_colour}`} stroke="#000" strokeWidth={r * 0.18} />
              <text x={r * 1.4} y={r * 0.45} fontSize={r * 1.5} className="car-label" strokeWidth={r * 0.4}>
                {d.name_acronym}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
