import type { Analysis, Horizon, Site, TimelineRow, Window } from "./types";

/**
 * DEMO MODEL — used only when neither the backend nor a saved snapshot is
 * reachable. It is a rough analytic approximation (mean lunar motion +
 * libration), NOT the SPICE pipeline. The UI badges it as "Demo data".
 */

export const DEMO_SITES: Site[] = [
  {
    id: "site_001",
    name: "Connecting Ridge / Site 001",
    latitude_deg: -89.45,
    longitude_deg: 222.69,
    elevation_m: 1954.8,
    slope_deg: 9.4,
    source: "Kumari et al., Planetary Science Journal (2022)",
    note: "Representative published point, not an approved landing zone",
    terrain_source: "placeholder",
  },
  {
    id: "site_004",
    name: "Shackleton Rim / Site 004",
    latitude_deg: -89.78,
    longitude_deg: 204.27,
    elevation_m: null,
    slope_deg: null,
    source: "Kumari et al., Planetary Science Journal (2022)",
    note: "Representative published point, not an approved landing zone",
    terrain_source: "placeholder",
  },
  {
    id: "site_004_crest",
    name: "Shackleton crest / near Site 004",
    latitude_deg: -89.78033,
    longitude_deg: 203.81414,
    elevation_m: null,
    slope_deg: null,
    source: "Team-chosen crest 54 m from Site 004's published point",
    note: "Team-chosen comparison point, not a published or approved site",
    terrain_source: "placeholder",
  },
  {
    id: "site_malapert",
    name: "Malapert Massif / MMA_K2023",
    latitude_deg: -85.992,
    longitude_deg: 2.056,
    elevation_m: null,
    slope_deg: null,
    source: "Wueller et al., JGR Planets (2026)",
    note: "Representative research site, not an approved landing zone",
    terrain_source: "placeholder",
  },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function demoHorizon(siteId: string): Horizon {
  const seed = hash(siteId);
  const az: number[] = [];
  const el: number[] = [];
  for (let a = 0; a < 360; a++) {
    const r = (a * Math.PI) / 180;
    let v = 1.2;
    for (let k = 1; k <= 6; k++) {
      const ph = ((seed >> (k * 3)) % 628) / 100;
      v += (1.1 / k) * Math.sin(k * r + ph);
    }
    az.push(a);
    el.push(Math.max(0, +v.toFixed(3)));
  }
  return { site_id: siteId, terrain_source: "placeholder", horizon_azimuths: az, horizon_elevations: el };
}

const SYNODIC = 29.530589; // days
const ANOMALISTIC = 27.554550;
const DRACONIC = 27.212221;
const ECLIPSE_YEAR = 346.62;
const J2000 = Date.UTC(2000, 0, 1, 12);

const norm = (a: number) => ((a % 360) + 360) % 360;
const rad = Math.PI / 180;

/** Elevation/azimuth of a body whose sub-point is (lat, lon), seen from a site. */
function lookAngles(siteLat: number, siteLon: number, subLat: number, subLon: number) {
  const p1 = siteLat * rad, p2 = subLat * rad, dl = (subLon - siteLon) * rad;
  const cosc = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const c = Math.acos(Math.min(1, Math.max(-1, cosc)));
  const az = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return { az: norm(az / rad), el: 90 - c / rad };
}

function sample(h: Horizon, az: number) {
  const n = h.horizon_elevations.length;
  const x = (norm(az) / 360) * n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return h.horizon_elevations[i] * (1 - f) + h.horizon_elevations[(i + 1) % n] * f;
}

function windowsOf(rows: TimelineRow[], key: "sun_visible" | "earth_visible" | "both_visible"): Window[] {
  const out: Window[] = [];
  let start: string | null = null;
  rows.forEach((r, i) => {
    if (r[key] && start === null) start = r.time;
    const last = i === rows.length - 1;
    if (start !== null && (!r[key] || last)) {
      const end = r.time;
      out.push({ start, end, duration_hours: (Date.parse(end) - Date.parse(start)) / 3.6e6 });
      start = null;
    }
  });
  return out;
}

function stats(rows: TimelineRow[], key: "sun_visible" | "earth_visible" | "both_visible", stepH: number) {
  let vis = 0, run = 0, off = 0, bestOn = 0, bestOff = 0;
  for (const r of rows) {
    if (r[key]) { vis++; run++; off = 0; bestOn = Math.max(bestOn, run); }
    else { off++; run = 0; bestOff = Math.max(bestOff, off); }
  }
  return {
    visible_hours: +(vis * stepH).toFixed(2),
    visible_percent: +((100 * vis) / rows.length).toFixed(2),
    longest_visible_hours: +(bestOn * stepH).toFixed(2),
    longest_not_visible_hours: +(bestOff * stepH).toFixed(2),
  };
}

export function demoAnalysis(siteId: string, start: string, end: string, stepMinutes: number): Analysis {
  const site = DEMO_SITES.find((s) => s.id === siteId) ?? DEMO_SITES[0];
  const hz = demoHorizon(siteId);
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const rows: TimelineRow[] = [];
  for (let t = t0; t <= t1; t += stepMinutes * 60000) {
    const d = (t - J2000) / 86_400_000;
    // Sub-solar point: longitude sweeps once per synodic month, latitude ±1.54°.
    const sunLon = norm(180 - (360 * d) / SYNODIC);
    const sunLat = 1.54 * Math.sin((2 * Math.PI * d) / ECLIPSE_YEAR);
    // Sub-Earth point: optical libration ±7.9° lon, ±6.7° lat.
    const earthLon = norm(7.9 * Math.sin((2 * Math.PI * d) / ANOMALISTIC));
    const earthLat = 6.7 * Math.sin((2 * Math.PI * d) / DRACONIC + 1.1);
    const s = lookAngles(site.latitude_deg, site.longitude_deg, sunLat, sunLon);
    const e = lookAngles(site.latitude_deg, site.longitude_deg, earthLat, earthLon);
    const sh = sample(hz, s.az), eh = sample(hz, e.az);
    const sv = s.el > sh, ev = e.el > eh;
    rows.push({
      time: new Date(t).toISOString().replace(".000Z", "Z"),
      sun_azimuth_deg: s.az, sun_elevation_deg: s.el, sun_horizon_deg: sh, sun_clearance_deg: s.el - sh,
      earth_azimuth_deg: e.az, earth_elevation_deg: e.el, earth_horizon_deg: eh, earth_clearance_deg: e.el - eh,
      sun_visible: sv, earth_visible: ev, both_visible: sv && ev,
    });
  }
  const stepH = stepMinutes / 60;
  return {
    site_id: siteId,
    coordinates: { latitude_deg: site.latitude_deg, longitude_deg: site.longitude_deg, elevation_km: 0 },
    timeline: rows,
    windows: { sun: windowsOf(rows, "sun_visible"), earth: windowsOf(rows, "earth_visible"), both: windowsOf(rows, "both_visible") },
    statistics: { sun: stats(rows, "sun_visible", stepH), earth: stats(rows, "earth_visible", stepH), both: stats(rows, "both_visible", stepH) },
    ephemeris_source: "demo",
    terrain_source: "placeholder",
  };
}
