import { useEffect, useMemo, useRef, useState } from "react";
import { useHorizon, useStore } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { angDiff, cardinal, DEG, norm360 } from "../../lib/geo";
import { horizonAt, type SkyState } from "../../lib/timeline";
import type { Horizon } from "../../api/types";
import { EarthIcon, SunIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

/**
 * "Stand on the Moon": stylized 2.5D horizon view.
 *  - Silhouette = LOLA terrain horizon h(Az) from the backend.
 *  - Sun (0.53°) and Earth (~1.9°) drawn at true angular size and position.
 *  - Horizontal and vertical use the same px/degree scale unless the user
 *    turns on vertical exaggeration, which is always labelled on screen.
 * Owner: Felix (surface POV). Reads only shared state: site + global time.
 */

const SUN_RADIUS_DEG = 0.2666;
const EARTH_RADIUS_DEG = 0.95;

/** Fixed pseudo-random star field in az/el. */
function makeStars(n = 900) {
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ az: rnd() * 360, el: Math.asin(rnd()) / DEG, b: 0.25 + rnd() ** 3 * 0.75, r: rnd() < 0.06 ? 1.3 : 0.7 }));
}

function unitVec(az: number, el: number) {
  const a = az * DEG, e = el * DEG;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/** Fraction of Earth's disc that is sunlit, as seen from the Moon. */
function earthPhase(sky: SkyState) {
  const s = unitVec(sky.sun.az, sky.sun.el), e = unitVec(sky.earth.az, sky.earth.el);
  const elong = Math.acos(Math.min(1, s[0] * e[0] + s[1] * e[1] + s[2] * e[2]));
  const phaseAngle = Math.PI - elong; // Sun–Earth–Moon angle
  return (1 + Math.cos(phaseAngle)) / 2;
}

function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  horizon: Horizon | undefined,
  sky: SkyState | undefined,
  heading: number,
  fov: number,
  exag: number,
  stars: ReturnType<typeof makeStars>,
) {
  const pxDeg = W / fov;
  const y0 = H * 0.64; // 0° elevation
  const X = (az: number) => W / 2 + angDiff(heading, az) * pxDeg;
  const Y = (el: number) => y0 - el * pxDeg * exag;
  const sunUp = !!sky?.sun.visible;
  const sunEl = sky?.sun.el ?? -10;

  // Sky: black; faint glow near the Sun's azimuth when it is up.
  ctx.fillStyle = "#010205";
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    const d = angDiff(heading, st.az);
    if (Math.abs(d) > fov / 2 + 1) continue;
    const y = Y(st.el / Math.max(1, exag) + 0.5);
    if (y < 0) continue;
    ctx.globalAlpha = st.b * (sunUp ? 0.35 : 0.9);
    ctx.fillStyle = "#e9eef8";
    ctx.fillRect(W / 2 + d * pxDeg, y, st.r, st.r);
  }
  ctx.globalAlpha = 1;

  // Elevation grid
  const step = fov > 90 ? 5 : fov > 40 ? 2 : 1;
  ctx.font = "11px 'JetBrains Mono', monospace";
  for (let e = -10; e <= 60; e += step) {
    const y = Y(e);
    if (y < 0 || y > H) continue;
    ctx.strokeStyle = e === 0 ? "rgba(140,170,220,0.35)" : "rgba(140,170,220,0.10)";
    ctx.setLineDash(e === 0 ? [6, 6] : []);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(180,200,235,0.55)";
    ctx.fillText(`${e}°`, 8, y - 4);
  }
  ctx.setLineDash([]);

  // Sun (drawn before terrain so ridges occlude it correctly)
  if (sky) {
    const sx = X(sky.sun.az), sy = Y(sky.sun.el);
    const r = Math.max(2.5, SUN_RADIUS_DEG * pxDeg);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 14);
    g.addColorStop(0, "rgba(255,244,214,0.55)");
    g.addColorStop(0.2, "rgba(255,210,140,0.18)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * exag, 0, 0, Math.PI * 2);
    ctx.fill();

    // Earth with phase
    const ex = X(sky.earth.az), ey = Y(sky.earth.el);
    const er = Math.max(4, EARTH_RADIUS_DEG * pxDeg);
    const k = earthPhase(sky);
    const toSun = Math.atan2(-(sky.sun.el - sky.earth.el) * exag, angDiff(sky.earth.az, sky.sun.az));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, exag);
    ctx.fillStyle = "#0d1a2e";
    ctx.beginPath();
    ctx.arc(0, 0, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(toSun);
    // lit part: half disc towards the Sun + terminator ellipse
    const grd = ctx.createLinearGradient(-er, 0, er, 0);
    grd.addColorStop(0, "#2f6fb8");
    grd.addColorStop(1, "#9cd3ff");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, er, -Math.PI / 2, Math.PI / 2);
    const tx = er * (1 - 2 * k);
    ctx.ellipse(0, 0, Math.abs(tx), er, 0, Math.PI / 2, -Math.PI / 2, tx > 0);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(160,205,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er + 2, (er + 2) * exag, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Terrain silhouette
  if (horizon) {
    const pts: [number, number][] = [];
    for (let x = -2; x <= W + 2; x += 2) {
      const az = norm360(heading + (x - W / 2) / pxDeg);
      pts.push([x, Y(horizonAt(horizon, az))]);
    }
    const lit = sunUp ? Math.min(1, 0.35 + sunEl / 6) : 0.12;
    const grad = ctx.createLinearGradient(0, Math.min(...pts.map((p) => p[1])), 0, H);
    grad.addColorStop(0, `rgba(${110 + 70 * lit},${108 + 64 * lit},${104 + 56 * lit},1)`);
    grad.addColorStop(0.25, `rgb(${40 + 40 * lit},${40 + 38 * lit},${42 + 34 * lit})`);
    grad.addColorStop(1, "#07080b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-2, H);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W + 2, H);
    ctx.closePath();
    ctx.fill();

    // Sunlit rim on ridges facing the Sun
    if (sky && sunUp) {
      ctx.lineWidth = 1.6;
      for (let i = 1; i < pts.length; i++) {
        const az = norm360(heading + (pts[i][0] - W / 2) / pxDeg);
        const facing = Math.cos(angDiff(az, sky.sun.az) * DEG);
        if (facing < 0.2) continue;
        ctx.strokeStyle = `rgba(255,226,170,${0.15 + 0.6 * facing * Math.min(1, sunEl / 3 + 0.3)})`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "rgba(170,190,220,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  // Compass ribbon
  const rb = H - 34;
  ctx.fillStyle = "rgba(4,6,12,0.65)";
  ctx.fillRect(0, rb, W, 34);
  ctx.strokeStyle = "rgba(170,190,230,0.4)";
  ctx.fillStyle = "rgba(210,222,245,0.85)";
  ctx.textAlign = "center";
  const tick = fov > 120 ? 15 : fov > 60 ? 10 : 5;
  for (let a = 0; a < 360; a += tick) {
    const d = angDiff(heading, a);
    if (Math.abs(d) > fov / 2) continue;
    const x = W / 2 + d * pxDeg;
    const major = a % 45 === 0;
    ctx.beginPath();
    ctx.moveTo(x, rb);
    ctx.lineTo(x, rb + (major ? 10 : 5));
    ctx.stroke();
    if (major) {
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(cardinal(a), x, rb + 24);
    } else if (a % (tick * 2) === 0) {
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(180,195,225,0.6)";
      ctx.fillText(`${a}`, x, rb + 23);
      ctx.fillStyle = "rgba(210,222,245,0.85)";
    }
  }
  ctx.textAlign = "left";

  // Off-screen indicators + ribbon markers
  if (sky) {
    for (const [k, body, color] of [
      ["Sun", sky.sun, "#ffc35c"],
      ["Earth", sky.earth, "#7cc4ff"],
    ] as const) {
      const d = angDiff(heading, body.az);
      const x = W / 2 + d * pxDeg;
      if (Math.abs(d) <= fov / 2) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, rb - 1);
        ctx.lineTo(x - 5, rb - 9);
        ctx.lineTo(x + 5, rb - 9);
        ctx.fill();
      } else {
        const right = d > 0;
        const ex = right ? W - 16 : 16;
        const ey = Math.min(Math.max(Y(body.el), 60), rb - 30);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ex + (right ? 8 : -8), ey);
        ctx.lineTo(ex, ey - 7);
        ctx.lineTo(ex, ey + 7);
        ctx.fill();
        ctx.font = "600 11px Inter, sans-serif";
        ctx.textAlign = right ? "right" : "left";
        ctx.fillText(`${k} ${Math.abs(d).toFixed(0)}° ${right ? "→" : "←"}`, ex + (right ? -6 : 6), ey + 4);
        ctx.textAlign = "left";
      }
    }
  }
}

export function SurfacePOV() {
  const siteId = useStore((s) => s.selectedSiteId);
  const site = useStore((s) => s.sites.find((x) => x.id === siteId));
  const horizon = useHorizon(siteId);
  const { sky, status } = useSiteSky(siteId);
  const planner = useStore((s) => s.mode === "planner");
  const [heading, setHeading] = useState<number | null>(null);
  const [fov, setFov] = useState(70);
  const [exag, setExag] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stars = useMemo(() => makeStars(), []);
  const drag = useRef<{ x: number; h: number } | null>(null);

  // Face the Sun when first opened for a site.
  useEffect(() => setHeading(null), [siteId]);
  const h = heading ?? sky?.sun.az ?? 0;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, size.w, size.h, horizon, sky, h, fov, planner ? exag : 1, stars);
  }, [size, horizon, sky, h, fov, exag, stars, planner]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || (e.target as HTMLElement)?.getAttribute("role") === "slider") return;
      if (e.key === "ArrowLeft") setHeading(norm360(h - 5));
      if (e.key === "ArrowRight") setHeading(norm360(h + 5));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);

  return (
    <div className="pov">
      <div
        ref={wrap}
        className="pov__stage"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, h };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          setHeading(norm360(drag.current.h - (dx / size.w) * fov));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setFov((f) => Math.min(160, Math.max(12, f * Math.exp(e.deltaY * 0.001))))}
      >
        <canvas ref={canvas} style={{ width: "100%", height: "100%" }} />
      </div>

      <div className="pov__hud glass">
        <div className="eyebrow">Standing at</div>
        <div className="pov__site">{site ? (planner ? site.name : shortName(site)) : "—"}</div>
        <div className="small muted">
          Looking {cardinal(h)}
          {planner ? ` (${h.toFixed(0)}°) · field of view ${fov.toFixed(0)}°` : ""}
        </div>
        {status === "loading" && <div className="small muted">Loading…</div>}
        {sky && planner && (
          <div className="pov__read">
            <div className={`pov__body ${sky.sun.visible ? "on-sun" : "off"}`}>
              <SunIcon size={16} />
              <span>Sun</span>
              <span className="mono">el {sky.sun.el.toFixed(2)}°</span>
              <span className="mono">{sky.sun.clearance >= 0 ? "▲ +" : "▼ "}{sky.sun.clearance.toFixed(2)}° vs terrain</span>
            </div>
            <div className={`pov__body ${sky.earth.visible ? "on-earth" : "off"}`}>
              <EarthIcon size={16} />
              <span>Earth</span>
              <span className="mono">el {sky.earth.el.toFixed(2)}°</span>
              <span className="mono">{sky.earth.clearance >= 0 ? "▲ +" : "▼ "}{sky.earth.clearance.toFixed(2)}° vs terrain</span>
            </div>
          </div>
        )}
        {sky && !planner && (
          <div className="pov__read">
            <div className={`pov__body pov__body--plain ${sky.sun.visible ? "on-sun" : "off"}`}>
              <SunIcon size={16} />
              <span>{sky.sun.visible ? "The Sun is just above the hills" : "The Sun is behind the hills"}</span>
            </div>
            <div className={`pov__body pov__body--plain ${sky.earth.visible ? "on-earth" : "off"}`}>
              <EarthIcon size={16} />
              <span>{sky.earth.visible ? "Earth is in view" : "Earth is hidden"}</span>
            </div>
            <p className="small muted">At the pole the Sun never climbs high: it circles the horizon once a month.</p>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {sky
            ? `Facing ${cardinal(h)}. Sun ${sky.sun.visible ? `${sky.sun.clearance.toFixed(1)} degrees above the terrain` : "hidden behind terrain"}, Earth ${sky.earth.visible ? "in view" : "hidden"}.`
            : ""}
        </p>
        <div className="pov__btns">
          <button className="btn btn--small" onClick={() => sky && setHeading(sky.sun.az)}>
            <SunIcon size={14} /> Face Sun
          </button>
          <button className="btn btn--small" onClick={() => sky && setHeading(sky.earth.az)}>
            <EarthIcon size={14} /> Face Earth
          </button>
        </div>
        {planner && (
          <label className="pov__exag small">
            Vertical exaggeration
            <select value={exag} onChange={(e) => setExag(Number(e.target.value))}>
              <option value={1}>None (true angles)</option>
              <option value={3}>3×</option>
              <option value={6}>6×</option>
            </select>
          </label>
        )}
        <div className="small muted">Drag to look around · scroll to zoom · ← → keys</div>
      </div>
      {planner && exag !== 1 && <div className="pov__exag-badge">Vertical ×{exag}: angles above the horizon are stretched</div>}
    </div>
  );
}
