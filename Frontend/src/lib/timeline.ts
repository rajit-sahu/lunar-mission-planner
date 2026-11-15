import type { Analysis, Horizon, Window } from "../api/types";
import { angDiff, norm360 } from "./geo";

/** Column-oriented timeline for fast interpolation at 60 fps. */
export interface Series {
  t: Float64Array;
  sunAz: Float64Array;
  sunEl: Float64Array;
  sunClr: Float64Array;
  earthAz: Float64Array;
  earthEl: Float64Array;
  earthClr: Float64Array;
  start: number;
  end: number;
}

const cache = new WeakMap<Analysis, Series>();

export function toSeries(a: Analysis): Series {
  const hit = cache.get(a);
  if (hit) return hit;
  const n = a.timeline.length;
  const s: Series = {
    t: new Float64Array(n),
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n),
    sunClr: new Float64Array(n),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    earthClr: new Float64Array(n),
    start: 0,
    end: 0,
  };
  a.timeline.forEach((r, i) => {
    s.t[i] = Date.parse(r.time);
    s.sunAz[i] = r.sun_azimuth_deg;
    s.sunEl[i] = r.sun_elevation_deg;
    s.sunClr[i] = r.sun_clearance_deg;
    s.earthAz[i] = r.earth_azimuth_deg;
    s.earthEl[i] = r.earth_elevation_deg;
    s.earthClr[i] = r.earth_clearance_deg;
  });
  s.start = s.t[0];
  s.end = s.t[n - 1];
  cache.set(a, s);
  return s;
}

export interface BodyState {
  az: number;
  el: number;
  clearance: number; // el − terrain horizon at az
  horizon: number;
  visible: boolean;
}
export interface SkyState {
  t: number;
  sun: BodyState;
  earth: BodyState;
  both: boolean;
  inRange: boolean;
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}
function lerpAz(a: number, b: number, f: number) {
  return norm360(a + angDiff(a, b) * f);
}

/**
 * Sky state at time t, interpolated between timeline samples. Visibility uses
 * the interpolated clearance, so at sample times it matches the backend
 * exactly; transitions between samples are accurate to within one step
 * (precise transition times come from the backend's refined windows).
 */
export function sampleAt(s: Series, t: number): SkyState {
  const n = s.t.length;
  const inRange = t >= s.start && t <= s.end;
  const tc = Math.min(s.end, Math.max(s.start, t));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= tc) lo = mid;
    else hi = mid;
  }
  const f = s.t[hi] === s.t[lo] ? 0 : (tc - s.t[lo]) / (s.t[hi] - s.t[lo]);
  const body = (az: Float64Array, el: Float64Array, clr: Float64Array): BodyState => {
    const e = lerp(el[lo], el[hi], f);
    const c = lerp(clr[lo], clr[hi], f);
    return { az: lerpAz(az[lo], az[hi], f), el: e, clearance: c, horizon: e - c, visible: c > 0 };
  };
  const sun = body(s.sunAz, s.sunEl, s.sunClr);
  const earth = body(s.earthAz, s.earthEl, s.earthClr);
  return { t, sun, earth, both: sun.visible && earth.visible, inRange };
}

/** Terrain horizon elevation at an azimuth (linear between 1° bins, wraps at 360). */
export function horizonAt(h: Horizon, az: number) {
  const n = h.horizon_elevations.length;
  const step = 360 / n;
  const x = norm360(az) / step;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return h.horizon_elevations[i] * (1 - f) + h.horizon_elevations[(i + 1) % n] * f;
}

export interface Countdown {
  /** "set" = currently visible, ms until it sets. "rise" = hidden, ms until it rises. */
  kind: "set" | "rise" | "none";
  ms: number;
  /** True when the window runs past the end of the analysed range. */
  beyondRange: boolean;
  window?: Window;
}

export function countdown(windows: Window[], t: number, rangeEnd: number): Countdown {
  for (const w of windows) {
    const a = Date.parse(w.start), b = Date.parse(w.end);
    if (t >= a && t < b) return { kind: "set", ms: b - t, beyondRange: b >= rangeEnd - 1000, window: w };
    if (a > t) return { kind: "rise", ms: a - t, beyondRange: false, window: w };
  }
  return { kind: "none", ms: Math.max(0, rangeEnd - t), beyondRange: true };
}

export function formatDuration(ms: number, short = false) {
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (short) {
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${String(m).padStart(d || h ? 2 : 1, "0")}m`);
  return parts.join(" ");
}

export function formatHours(h: number | undefined) {
  if (h === undefined || Number.isNaN(h)) return "—";
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h.toFixed(1)} h`;
}

export const fmtUTC = (t: number, withTime = true) => {
  const d = new Date(t);
  const date = d.toISOString().slice(0, 10);
  return withTime ? `${date} ${d.toISOString().slice(11, 16)} UTC` : date;
};
