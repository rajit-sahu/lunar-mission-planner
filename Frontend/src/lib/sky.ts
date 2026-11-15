import { DEG, norm360 } from "./geo";

/**
 * Re-express a sky direction seen from one surface point in the local
 * horizon of another. Uses the backend's conventions (Science/ephemeris:
 * East-North-Up on a sphere, azimuth clockwise from north).
 *
 * The Sun and Earth are so far away that moving a few km on the Moon
 * changes their *direction* by < 0.0002 deg (parallax); what changes is the
 * local horizon itself. Near the pole that is large: 1 km can rotate local
 * north, and so every azimuth, by several degrees.
 */
type V3 = [number, number, number];

function enu(latDeg: number, lonDeg: number): [V3, V3, V3] {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const east: V3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: V3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const up: V3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  return [east, north, up];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Moon-fixed unit vector for an azimuth/elevation seen from (lat, lon). */
export function dirFromAzEl(latDeg: number, lonDeg: number, azDeg: number, elDeg: number): V3 {
  const [e, n, u] = enu(latDeg, lonDeg);
  const ce = Math.cos(elDeg * DEG), se = Math.sin(elDeg * DEG);
  const sa = Math.sin(azDeg * DEG), ca = Math.cos(azDeg * DEG);
  return [0, 1, 2].map((i) => ce * sa * e[i] + ce * ca * n[i] + se * u[i]) as V3;
}

/** Azimuth/elevation of a Moon-fixed direction seen from (lat, lon). */
export function azElOf(latDeg: number, lonDeg: number, d: V3) {
  const [e, n, u] = enu(latDeg, lonDeg);
  const x = dot(d, e), y = dot(d, n), z = dot(d, u);
  return { az: norm360(Math.atan2(x, y) / DEG), el: Math.atan2(z, Math.hypot(x, y)) / DEG };
}

export interface FrameShift {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
}

/** Move an az/el from the landing point's horizon frame to a nearby point's. */
export function shiftAzEl(f: FrameShift, az: number, el: number) {
  if (f.from.lat === f.to.lat && f.from.lon === f.to.lon) return { az, el };
  return azElOf(f.to.lat, f.to.lon, dirFromAzEl(f.from.lat, f.from.lon, az, el));
}
