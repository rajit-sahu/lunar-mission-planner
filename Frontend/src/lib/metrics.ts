import type { Analysis, Window } from "../api/types";
import { DAY } from "../state/store";
import { DEG } from "./geo";
import { SOLAR_CONSTANT } from "./power";

/**
 * Mission metrics measured from touchdown (the start of the analysed range).
 * These are what a landing decision turns on: is there power and a radio
 * link right away, and for how long? Ranges are exact, from the backend's
 * refined windows, except energy, which integrates the 30-min timeline.
 */
export interface MissionMetrics {
  sunAtLanding: boolean;
  earthAtLanding: boolean;
  /** Hours from touchdown until the Sun first sets (0 if dark at touchdown). */
  firstSunsetH: number;
  /** The first sunlit stretch runs past the end of the analysed range. */
  firstSunsetAtLeast: boolean;
  /** Hours from touchdown until first sunrise (0 if sunlit at touchdown). */
  firstSunriseH: number;
  /** Share (%) of the first 72 h with Sun / Earth / both. */
  first72Sun: number;
  first72Earth: number;
  first72Both: number;
  /** Longest gap without Earth in the first 7 days (h). */
  earthGap7dH: number;
  /** Whole-range shares (%). */
  sunPct: number;
  earthPct: number;
  bothPct: number;
  longestDarkH: number;
  longestDarkAtLeast: boolean;
  longestEarthOutH: number;
  longestEarthOutAtLeast: boolean;
  /** Mean daily solar energy on 1 m² of vertical Sun-tracking panel over the first 7 days (Wh/m²/day). */
  energy7dWhPerM2Day: number;
}

const ms = (iso: string) => Date.parse(iso);
const H = 3_600_000;

function overlapH(ws: Window[], a: number, b: number) {
  let t = 0;
  for (const w of ws) t += Math.max(0, Math.min(ms(w.end), b) - Math.max(ms(w.start), a));
  return t / H;
}

function longestGapH(ws: Window[], a: number, b: number) {
  let cur = a;
  let best = 0;
  for (const w of ws) {
    const s = Math.max(ms(w.start), a);
    const e = Math.min(ms(w.end), b);
    if (e <= a || s >= b) continue;
    best = Math.max(best, s - cur);
    cur = Math.max(cur, e);
  }
  return Math.max(best, b - cur) / H;
}

const containing = (ws: Window[], t: number) => ws.find((w) => ms(w.start) <= t + 60_000 && t < ms(w.end));

export function missionMetrics(a: Analysis): MissionMetrics {
  const t0 = ms(a.timeline[0].time);
  const tEnd = ms(a.timeline[a.timeline.length - 1].time);
  const { sun, earth, both } = a.windows;
  const s = a.statistics;

  const firstSun = containing(sun, t0);
  const nextSun = sun.find((w) => ms(w.start) > t0);
  const t72 = Math.min(t0 + 72 * H, tEnd);
  const t7d = Math.min(t0 + 7 * DAY, tEnd);
  const span72 = (t72 - t0) / H || 1;

  // Energy: integrate cos(el) x visible disc fraction over the first 7 days.
  let wh = 0;
  const rows = a.timeline;
  for (let i = 0; i + 1 < rows.length; i++) {
    const r = rows[i];
    const t = ms(r.time);
    if (t >= t7d) break;
    const dtH = (ms(rows[i + 1].time) - t) / H;
    const frac = r.sun_disc_fraction ?? (r.sun_visible ? 1 : 0);
    const au = r.sun_distance_km ? (149_597_870.7 / r.sun_distance_km) ** 2 : 1;
    wh += SOLAR_CONSTANT * au * Math.cos(r.sun_elevation_deg * DEG) * frac * dtH;
  }

  return {
    sunAtLanding: !!firstSun,
    earthAtLanding: !!containing(earth, t0),
    firstSunsetH: firstSun ? (ms(firstSun.end) - t0) / H : 0,
    firstSunsetAtLeast: !!firstSun && (firstSun.clipped_end ?? ms(firstSun.end) >= tEnd - 1000),
    firstSunriseH: firstSun ? 0 : nextSun ? (ms(nextSun.start) - t0) / H : (tEnd - t0) / H,
    first72Sun: (100 * overlapH(sun, t0, t72)) / span72,
    first72Earth: (100 * overlapH(earth, t0, t72)) / span72,
    first72Both: (100 * overlapH(both, t0, t72)) / span72,
    earthGap7dH: longestGapH(earth, t0, t7d),
    sunPct: s.sun.visible_percent ?? 0,
    earthPct: s.earth.visible_percent ?? 0,
    bothPct: s.both.visible_percent ?? 0,
    longestDarkH: s.sun.longest_not_visible_hours ?? 0,
    longestDarkAtLeast: !!s.sun.longest_not_visible_clipped,
    longestEarthOutH: s.earth.longest_not_visible_hours ?? 0,
    longestEarthOutAtLeast: !!s.earth.longest_not_visible_clipped,
    energy7dWhPerM2Day: wh / ((t7d - t0) / DAY || 1),
  };
}

export type Priority = "both" | "sun" | "earth";

export interface Constraints {
  /** Continuous sunlight needed from touchdown (h). */
  minSunFromLandingH: number;
  /** Earth must be in view at touchdown (descent/landing comms). */
  earthAtLanding: boolean;
  /** Longest acceptable gap without Earth in the first 7 days (h). */
  maxEarthGap7dH: number;
  /** Steepest acceptable ground (deg). */
  maxSlopeDeg: number;
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  minSunFromLandingH: 48,
  earthAtLanding: true,
  maxEarthGap7dH: 48,
  maxSlopeDeg: 10, // NASA Artemis III landing requirement: < 10 deg over 100 m (Dwyer Cianciolo, NASA, 2024)
};

export interface Candidate {
  id: string;
  label: string;
  m: MissionMetrics;
  slopeDeg: number | null;
}

export interface Verdict {
  id: string;
  passes: boolean;
  failures: string[];
  score: number;
  /** Tie-break: hours of sunlight from touchdown (longer first). */
  tiebreak: number;
  /** Other candidates equal on pass/fail and the main score (shown as a tie). */
  tiedWith: string[];
}

export const scoreFor = (m: MissionMetrics, p: Priority) =>
  p === "both" ? m.first72Both : p === "sun" ? Math.min(m.firstSunsetH, 24 * 30) : m.first72Earth;

export function judge(c: Candidate, k: Constraints, p: Priority): Verdict {
  const failures: string[] = [];
  const { m } = c;
  if (!m.sunAtLanding) failures.push(`dark at touchdown (Sun rises after ${fmtH(m.firstSunriseH)})`);
  else if (m.firstSunsetH < k.minSunFromLandingH) failures.push(`Sun sets ${fmtH(m.firstSunsetH)} after touchdown`);
  if (k.earthAtLanding && !m.earthAtLanding) failures.push("Earth hidden at touchdown");
  if (m.earthGap7dH > k.maxEarthGap7dH) failures.push(`${fmtH(m.earthGap7dH)} without Earth in week 1`);
  if (c.slopeDeg != null && c.slopeDeg > k.maxSlopeDeg) failures.push(`slope ${c.slopeDeg.toFixed(1)}° > ${k.maxSlopeDeg}°`);
  return { id: c.id, passes: failures.length === 0, failures, score: scoreFor(m, p), tiebreak: m.sunAtLanding ? m.firstSunsetH : -m.firstSunriseH, tiedWith: [] };
}

/** Best first: candidates meeting every constraint, then by the chosen priority, then by fewest failures. */
export function rank(cs: Candidate[], k: Constraints, p: Priority): Verdict[] {
  const vs = cs
    .map((c) => judge(c, k, p))
    .sort(
      (a, b) =>
        Number(b.passes) - Number(a.passes) ||
        a.failures.length - b.failures.length ||
        b.score - a.score ||
        b.tiebreak - a.tiebreak,
    );
  const same = (a: Verdict, b: Verdict) =>
    a.passes === b.passes && a.failures.length === b.failures.length && Math.abs(a.score - b.score) < 1e-9;
  for (const v of vs) v.tiedWith = vs.filter((o) => o !== v && same(o, v)).map((o) => o.id);
  return vs;
}

export function fmtH(h: number) {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${Math.round(h)} h`;
}

/** One plain-language sentence comparing on-time and delayed landings at a site. */
export function delaySentence(onTime: MissionMetrics, late: MissionMetrics, days: number) {
  const when = `Landing ${days} days late`;
  if (onTime.sunAtLanding && !late.sunAtLanding)
    return `${when} means touching down in the dark: the Sun doesn't rise for ${fmtH(late.firstSunriseH)}.`;
  if (!onTime.sunAtLanding && late.sunAtLanding)
    return `${when} actually helps: the lander arrives in sunlight instead of darkness.`;
  if (late.sunAtLanding && onTime.sunAtLanding) {
    const a = onTime.firstSunsetH, b = late.firstSunsetH;
    if (Math.abs(a - b) < 6) return `${when} barely changes things: about ${fmtH(b)} of sunlight after touchdown either way.`;
    return b < a
      ? `${when} cuts the first stretch of sunlight from ${fmtH(a)} to ${fmtH(b)}.`
      : `${when} lengthens the first stretch of sunlight from ${fmtH(a)} to ${fmtH(b)}.`;
  }
  return `${when} still lands in darkness${late.earthAtLanding ? ", though with Earth in view" : ""}.`;
}
