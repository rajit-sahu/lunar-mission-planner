import { useRef, useState } from "react";
import type { Analysis, Window } from "../../api/types";
import { DAY } from "../../state/store";
import { fmtUTC, formatDuration } from "../../lib/timeline";
import { useSize } from "./useSize";

export interface Lane {
  key: "sun" | "earth" | "both";
  label: string;
}

export const LANES: Lane[] = [
  { key: "sun", label: "Sunlight" },
  { key: "earth", label: "Earth in view" },
  { key: "both", label: "Both" },
];

interface Props {
  analysis?: Analysis;
  start: number;
  end: number;
  time: number;
  onScrub?: (t: number) => void;
  lanes?: Lane[];
  laneHeight?: number;
  showLabels?: boolean;
  showAxis?: boolean;
  /** Ticks labelled as days since `start` ("Day 3") instead of dates. */
  relative?: boolean;
  loading?: boolean;
}

/** Gantt-style visibility windows over a time range, with a scrubbable cursor. */
export function VisibilityLanes({
  analysis,
  start,
  end,
  time,
  onScrub,
  lanes = LANES,
  laneHeight = 14,
  showLabels = true,
  showAxis = true,
  relative = false,
  loading = false,
}: Props) {
  const [wrap, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; t: number; w?: Window; lane?: string } | null>(null);
  const dragging = useRef(false);
  const labelW = showLabels ? 92 : 0;
  const plotW = Math.max(10, width - labelW);
  const gap = 5;
  const axisH = showAxis ? 18 : 0;
  const height = lanes.length * (laneHeight + gap) + axisH;
  const x = (t: number) => labelW + ((t - start) / (end - start)) * plotW;
  const tAt = (px: number) => start + ((px - labelW) / plotW) * (end - start);

  const ticks: number[] = [];
  const days = (end - start) / DAY;
  const every = days > 20 ? 5 : days > 8 ? 2 : 1;
  for (let d = 0; d <= days + 1e-6; d += every) ticks.push(start + d * DAY);

  const toT = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return Math.min(end, Math.max(start, tAt(e.clientX - r.left)));
  };

  return (
    <div ref={wrap} className="lanes">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className={onScrub ? "lanes__svg scrub" : "lanes__svg"}
          onPointerDown={(e) => {
            if (!onScrub) return;
            dragging.current = true;
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            onScrub(toT(e));
          }}
          onPointerMove={(e) => {
            const t = toT(e);
            const r = (e.currentTarget as SVGElement).getBoundingClientRect();
            const laneIdx = Math.floor((e.clientY - r.top) / (laneHeight + gap));
            const lane = lanes[laneIdx];
            const w = lane && analysis?.windows[lane.key].find((w) => Date.parse(w.start) <= t && t <= Date.parse(w.end));
            setHover({ x: e.clientX - r.left, t, w, lane: lane?.label });
            if (dragging.current && onScrub) onScrub(t);
          }}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={height - axisH} className="lanes__grid" />
          ))}
          {lanes.map((lane, i) => {
            const y = i * (laneHeight + gap);
            return (
              <g key={lane.key}>
                {showLabels && (
                  <text x={0} y={y + laneHeight / 2 + 4} className="lanes__label">
                    {lane.label}
                  </text>
                )}
                <rect x={labelW} y={y} width={plotW} height={laneHeight} rx={3} className={`lanes__track ${loading ? "loading" : ""}`} />
                {analysis?.windows[lane.key].map((w, j) => {
                  const a = Math.max(start, Date.parse(w.start));
                  const b = Math.min(end, Date.parse(w.end));
                  if (b <= a) return null;
                  return <rect key={j} x={x(a)} y={y} width={Math.max(1, x(b) - x(a))} height={laneHeight} rx={3} className={`lanes__bar lanes__bar--${lane.key}`} />;
                })}
              </g>
            );
          })}
          {showAxis &&
            ticks.map((t) => (
              <text key={`l${t}`} x={x(t)} y={height - 4} className="lanes__tick" textAnchor="middle">
                {relative ? `Day ${Math.round((t - start) / DAY)}` : new Date(t).toISOString().slice(5, 10)}
              </text>
            ))}
          {time >= start && time <= end && (
            <g className="lanes__cursor">
              <line x1={x(time)} x2={x(time)} y1={-2} y2={height - axisH + 2} />
              <circle cx={x(time)} cy={-1} r={3.5} />
            </g>
          )}
        </svg>
      )}
      {hover && width > 0 && (
        <div className="lanes__tip" style={{ left: Math.min(Math.max(hover.x, 90), width - 90) }}>
          <div>{relative ? `Day ${((hover.t - start) / DAY).toFixed(1)}` : fmtUTC(hover.t)}</div>
          {hover.w && (
            <div className="muted">
              {hover.lane}: {formatDuration(Date.parse(hover.w.end) - Date.parse(hover.w.start), true)} window
            </div>
          )}
        </div>
      )}
    </div>
  );
}
