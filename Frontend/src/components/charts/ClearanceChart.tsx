import { useMemo, useRef } from "react";
import type { Analysis } from "../../api/types";
import { DAY } from "../../state/store";
import { useSize } from "./useSize";

interface Props {
  analysis?: Analysis;
  start: number;
  end: number;
  time: number;
  onScrub?: (t: number) => void;
  height?: number;
}

/**
 * Height of the Sun and Earth above the local terrain horizon over time.
 * Above the zero line = visible. This is the single most useful engineering
 * plot: it shows both *whether* and *by how much margin* a body is in view.
 */
export function ClearanceChart({ analysis, start, end, time, onScrub, height = 150 }: Props) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const pad = { l: 30, r: 8, t: 8, b: 18 };
  const w = Math.max(10, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const dragging = useRef(false);

  const { lo, hi } = useMemo(() => {
    let lo = -2, hi = 2;
    analysis?.timeline.forEach((r) => {
      lo = Math.min(lo, r.sun_clearance_deg, r.earth_clearance_deg);
      hi = Math.max(hi, r.sun_clearance_deg, r.earth_clearance_deg);
    });
    return { lo: Math.floor(lo - 0.5), hi: Math.ceil(hi + 0.5) };
  }, [analysis]);

  const X = (t: number) => pad.l + ((t - start) / (end - start)) * w;
  const Y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * h;

  const line = (key: "sun_clearance_deg" | "earth_clearance_deg") =>
    analysis ? analysis.timeline.map((r, i) => `${i ? "L" : "M"}${X(Date.parse(r.time)).toFixed(1)},${Y(r[key]).toFixed(1)}`).join("") : "";
  const sun = useMemo(() => line("sun_clearance_deg"), [analysis, width, height, lo, hi, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const earth = useMemo(() => line("earth_clearance_deg"), [analysis, width, height, lo, hi, start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const yTicks: number[] = [];
  const span = hi - lo;
  const step = span > 20 ? 5 : span > 8 ? 2 : 1;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
  const xTicks: number[] = [];
  for (let d = 0; d <= (end - start) / DAY; d += 5) xTicks.push(start + d * DAY);

  const scrub = (e: React.PointerEvent) => {
    if (!onScrub) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const t = start + ((e.clientX - r.left - pad.l) / w) * (end - start);
    onScrub(Math.min(end, Math.max(start, t)));
  };

  return (
    <div ref={ref} className="chart">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className={onScrub ? "scrub" : undefined}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            scrub(e);
          }}
          onPointerMove={(e) => dragging.current && scrub(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          <rect x={pad.l} y={pad.t} width={w} height={Y(0) - pad.t} className="chart__above" />
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + w} y1={Y(v)} y2={Y(v)} className={v === 0 ? "chart__zero" : "chart__grid"} />
              <text x={pad.l - 5} y={Y(v) + 3} className="chart__tick" textAnchor="end">
                {v}°
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={X(t)} y={height - 4} className="chart__tick" textAnchor="middle">
              {new Date(t).toISOString().slice(5, 10)}
            </text>
          ))}
          <text x={pad.l + 6} y={Y(0) - 5} className="chart__note">
            visible ↑ · terrain horizon · blocked ↓
          </text>
          <path d={earth} className="chart__line chart__line--earth" />
          <path d={sun} className="chart__line chart__line--sun" />
          {time >= start && time <= end && <line x1={X(time)} x2={X(time)} y1={pad.t} y2={pad.t + h} className="chart__cursor" />}
        </svg>
      )}
    </div>
  );
}
