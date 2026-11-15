import { useMemo } from "react";
import type { Analysis } from "../../api/types";
import { DAY } from "../../state/store";
import { useSize } from "./useSize";

type State = "both" | "sun" | "earth" | "none";

export const STATE_LABEL: Record<State, string> = {
  both: "Power + radio",
  sun: "Power only",
  earth: "Radio only",
  none: "Dark, no radio",
};

/**
 * One strip summarising a whole mission window: each stretch coloured by
 * whether the lander has sunlight, a radio line to Earth, both or neither.
 * Patterned as well as coloured so it reads without colour vision.
 */
export function CombinedStrip({
  analysis,
  time,
  height = 22,
  label,
  onScrub,
}: {
  analysis?: Analysis;
  time?: number;
  height?: number;
  label?: string;
  onScrub?: (t: number) => void;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const segs = useMemo(() => {
    if (!analysis) return [];
    const rows = analysis.timeline;
    const out: { a: number; b: number; s: State }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const s: State = r.both_visible ? "both" : r.sun_visible ? "sun" : r.earth_visible ? "earth" : "none";
      const t = Date.parse(r.time);
      const last = out[out.length - 1];
      if (last && last.s === s) last.b = t;
      else {
        if (last) last.b = t;
        out.push({ a: t, b: t, s });
      }
    }
    return out;
  }, [analysis]);
  if (!analysis) return <div ref={ref} className="strip strip--loading" style={{ height }} aria-label="Loading" />;
  const t0 = Date.parse(analysis.timeline[0].time);
  const t1 = Date.parse(analysis.timeline[analysis.timeline.length - 1].time);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * width;
  const days = Math.round((t1 - t0) / DAY);
  const summary = (["both", "sun", "earth", "none"] as State[])
    .map((s) => {
      const h = segs.filter((g) => g.s === s).reduce((n, g) => n + (g.b - g.a), 0) / DAY;
      return h > 0.05 ? `${STATE_LABEL[s]} about ${Math.round(h)} days` : null;
    })
    .filter(Boolean)
    .join(", ");
  return (
    <div ref={ref} className="strip" role="img" aria-label={`${label ? label + ": " : ""}${summary} over ${days} days`}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className={onScrub ? "scrub" : undefined}
          onPointerDown={(e) => {
            if (!onScrub) return;
            const r = (e.currentTarget as SVGElement).getBoundingClientRect();
            onScrub(t0 + ((e.clientX - r.left) / width) * (t1 - t0));
          }}
        >
          <defs>
            <pattern id="hatch-both" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="strip__both" />
              <line x1="0" y1="0" x2="0" y2="6" className="strip__hatch" />
            </pattern>
          </defs>
          {segs.map((g, i) => (
            <rect
              key={i}
              x={x(g.a)}
              y={0}
              width={Math.max(1, x(g.b) - x(g.a))}
              height={height}
              className={`strip__${g.s}`}
              fill={g.s === "both" ? "url(#hatch-both)" : undefined}
            />
          ))}
          {time !== undefined && time >= t0 && time <= t1 && <line x1={x(time)} x2={x(time)} y1={-2} y2={height + 2} className="strip__cursor" />}
        </svg>
      )}
    </div>
  );
}

export function StripLegend() {
  return (
    <div className="strip-legend small">
      {(["both", "sun", "earth", "none"] as State[]).map((s) => (
        <span key={s}>
          <i className={`strip-key strip-key--${s}`} /> {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
