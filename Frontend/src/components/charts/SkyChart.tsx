import { useMemo } from "react";
import type { Analysis, Horizon } from "../../api/types";
import type { SkyState } from "../../lib/timeline";
import { useSize } from "./useSize";

interface Props {
  horizon?: Horizon;
  analysis?: Analysis;
  sky?: SkyState;
  height?: number;
  showTracks?: boolean;
}

/**
 * Unrolled sky: azimuth (0–360°, N–E–S–W–N) against elevation, with the LOLA
 * terrain horizon filled and the Sun/Earth paths over the analysed range.
 * Angles are true (no exaggeration) on the y axis labels; the y range is fitted.
 */
export function SkyChart({ horizon, analysis, sky, height = 150, showTracks = true }: Props) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const pad = { l: 30, r: 8, t: 8, b: 18 };
  const w = Math.max(10, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;

  const { yMin, yMax } = useMemo(() => {
    let lo = -2, hi = 6;
    horizon?.horizon_elevations.forEach((e) => (hi = Math.max(hi, e + 1)));
    analysis?.timeline.forEach((r) => {
      hi = Math.max(hi, r.sun_elevation_deg + 1, r.earth_elevation_deg + 1);
      lo = Math.min(lo, r.sun_elevation_deg - 0.5, r.earth_elevation_deg - 0.5);
    });
    return { yMin: Math.max(lo, -12), yMax: Math.min(hi, 30) };
  }, [horizon, analysis]);

  const X = (az: number) => pad.l + (az / 360) * w;
  const Y = (el: number) => pad.t + ((yMax - el) / (yMax - yMin)) * h;

  const terrainPath = useMemo(() => {
    if (!horizon) return "";
    const pts = horizon.horizon_azimuths.map((a, i) => `${X(a).toFixed(1)},${Y(horizon.horizon_elevations[i]).toFixed(1)}`);
    pts.push(`${X(360).toFixed(1)},${Y(horizon.horizon_elevations[0]).toFixed(1)}`);
    return `M${X(0)},${Y(yMin)} L${pts.join(" L")} L${X(360)},${Y(yMin)} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, width, height, yMin, yMax]);

  const track = (key: "sun" | "earth") => {
    if (!analysis) return "";
    let d = "";
    let prevAz: number | null = null;
    analysis.timeline.forEach((r, i) => {
      if (i % 2) return;
      const az = key === "sun" ? r.sun_azimuth_deg : r.earth_azimuth_deg;
      const el = key === "sun" ? r.sun_elevation_deg : r.earth_elevation_deg;
      const jump = prevAz !== null && Math.abs(az - prevAz) > 180;
      d += `${d === "" || jump ? "M" : "L"}${X(az).toFixed(1)},${Y(el).toFixed(1)}`;
      prevAz = az;
    });
    return d;
  };
  const sunTrack = useMemo(() => (showTracks ? track("sun") : ""), [analysis, width, height, yMin, yMax, showTracks]); // eslint-disable-line react-hooks/exhaustive-deps
  const earthTrack = useMemo(() => (showTracks ? track("earth") : ""), [analysis, width, height, yMin, yMax, showTracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const yTicks: number[] = [];
  const step = yMax - yMin > 16 ? 5 : 2;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(v);

  return (
    <div ref={ref} className="chart">
      {width > 0 && (
        <svg width={width} height={height}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + w} y1={Y(v)} y2={Y(v)} className={v === 0 ? "chart__zero" : "chart__grid"} />
              <text x={pad.l - 5} y={Y(v) + 3} className="chart__tick" textAnchor="end">
                {v}°
              </text>
            </g>
          ))}
          {[0, 90, 180, 270, 360].map((a, i) => (
            <text key={a} x={X(a)} y={height - 4} className="chart__tick" textAnchor="middle">
              {["N", "E", "S", "W", "N"][i]}
            </text>
          ))}
          <path d={sunTrack} className="chart__track chart__track--sun" />
          <path d={earthTrack} className="chart__track chart__track--earth" />
          <path d={terrainPath} className="chart__terrain" />
          {sky && (
            <>
              <circle cx={X(sky.earth.az)} cy={Y(sky.earth.el)} r={5.5} className={`chart__earth ${sky.earth.visible ? "" : "blocked"}`} />
              <circle cx={X(sky.sun.az)} cy={Y(sky.sun.el)} r={5} className={`chart__sun ${sky.sun.visible ? "" : "blocked"}`} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
