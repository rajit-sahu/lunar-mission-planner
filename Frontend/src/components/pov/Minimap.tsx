import { placeName, type SvPoint, type SvSite } from "../../api/streetview";
import type { SkyState } from "../../lib/timeline";
import { DEG } from "../../lib/geo";

const SIZE = 196;

/**
 * Street-View-style inset: a LOLA hillshade of the area around the landing
 * point, the viewpoints you can walk to, your view cone and the directions
 * of the Sun and Earth. Angles use each point's local north on the map.
 */
export function Minimap({
  sv,
  point,
  heading,
  fov,
  sky,
  onPick,
}: {
  sv: SvSite;
  point: SvPoint;
  heading: number;
  fov: number;
  sky?: SkyState;
  onPick: (id: string) => void;
}) {
  const k = SIZE / sv.map.size_px;
  const P = (p: SvPoint) => [p.map_px[0] * k, p.map_px[1] * k] as const;
  const [cx, cy] = P(point);
  // Screen angle (clockwise from up) of a local azimuth at the current point.
  const ang = (az: number) => (point.map_north_deg + az) * DEG;
  const ray = (az: number, len: number) => [cx + Math.sin(ang(az)) * len, cy - Math.cos(ang(az)) * len] as const;
  const cone = (() => {
    const r = 46;
    const a0 = ray(heading - fov / 2, r), a1 = ray(heading + fov / 2, r);
    return `M${cx},${cy} L${a0[0]},${a0[1]} A${r},${r} 0 ${fov > 180 ? 1 : 0} 1 ${a1[0]},${a1[1]} Z`;
  })();
  const mPerPx = (2 * sv.map.half_extent_m) / SIZE;
  const barM = 500;
  const byId = new Map(sv.points.map((p) => [p.id, p]));

  return (
    <div className="minimap" aria-label="Map of nearby viewpoints">
      <img src={`/streetview/${sv.map.file}`} width={SIZE} height={SIZE} alt="" draggable={false} />
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {sv.points.flatMap((p) =>
          p.links
            .filter((l) => l.to > p.id)
            .map((l) => {
              const q = byId.get(l.to);
              if (!q) return null;
              const [x1, y1] = P(p), [x2, y2] = P(q);
              return <line key={`${p.id}-${l.to}`} x1={x1} y1={y1} x2={x2} y2={y2} className="minimap__path" />;
            }),
        )}
        <path d={cone} className="minimap__cone" />
        {sky && (
          <>
            <line x1={cx} y1={cy} x2={ray(sky.sun.az, 80)[0]} y2={ray(sky.sun.az, 80)[1]} className={`minimap__sun ${sky.sun.visible ? "" : "blocked"}`} />
            <line x1={cx} y1={cy} x2={ray(sky.earth.az, 80)[0]} y2={ray(sky.earth.az, 80)[1]} className={`minimap__earth ${sky.earth.visible ? "" : "blocked"}`} />
          </>
        )}
        {sv.points.map((p) => {
          const [x, y] = P(p);
          const here = p.id === point.id;
          return (
            <g key={p.id} className={`minimap__pt ${here ? "is-here" : ""} ${p.id === "landing" ? "is-landing" : ""}`} onClick={() => !here && onPick(p.id)}>
              <circle cx={x} cy={y} r={here ? 6 : 4.5} />
              <title>{placeName(p.label)}</title>
            </g>
          );
        })}
        <g className="minimap__north" transform={`translate(${SIZE - 16},16) rotate(${point.map_north_deg})`}>
          <path d="M0,-9 L4,4 L0,1 L-4,4 Z" />
          <text y={15} transform={`rotate(${-point.map_north_deg} 0 15)`}>
            N
          </text>
        </g>
        <g transform={`translate(8,${SIZE - 10})`} className="minimap__scale">
          <line x1={0} x2={barM / mPerPx} y1={0} y2={0} />
          <text x={barM / mPerPx + 4} y={3}>
            {barM} m
          </text>
        </g>
      </svg>
      <div className="sr-only">
        Viewpoints:{" "}
        {sv.points.map((p) => (
          <button key={p.id} onClick={() => onPick(p.id)}>
            {placeName(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
