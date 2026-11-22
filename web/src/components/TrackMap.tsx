import { useEffect, useMemo, useRef } from 'react';
import { carMotion, useDashboard } from '../state';

const PAD = 600; // track units of padding around the outline

export function TrackMap() {
  const track = useDashboard((s) => s.track);
  const drivers = useDashboard((s) => s.drivers);
  const position = useDashboard((s) => s.position);
  const dotRefs = useRef(new Map<string, SVGGElement>());

  const view = useMemo(() => {
    if (!track) return null;
    const { minX, maxX, minY, maxY } = track.bounds;
    // OpenF1 y grows upwards; SVG y grows downwards, so flip y.
    const path = track.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${-y}`).join(' ') + ' Z';
    return { viewBox: `${minX - PAD} ${-maxY - PAD} ${maxX - minX + 2 * PAD} ${maxY - minY + 2 * PAD}`, path, size: Math.max(maxX - minX, maxY - minY) };
  }, [track]);

  // Move the car dots every frame, interpolating between ~3.7 Hz samples.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      for (const [driver, el] of dotRefs.current) {
        const m = carMotion.get(driver);
        if (!m) {
          el.style.display = 'none';
          continue;
        }
        const k = Math.min(1, (now - m.at) / m.dur);
        const x = m.fromX + (m.toX - m.fromX) * k;
        const y = m.fromY + (m.toY - m.fromY) * k;
        el.style.display = '';
        el.setAttribute('transform', `translate(${x} ${-y})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!view) return <section className="map muted">No track outline for this session</section>;

  const r = view.size / 90;
  // Draw the leaders last so they sit on top.
  const order = Object.keys(drivers).sort((a, b) => Number(position[b]?.position ?? 99) - Number(position[a]?.position ?? 99));

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
              <circle r={r} fill={`#${d.team_colour}`} stroke="#000" strokeWidth={r * 0.18} />
              <text x={r * 1.4} y={r * 0.45} fontSize={r * 1.5} className="car-label">
                {d.name_acronym}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
