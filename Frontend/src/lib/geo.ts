import * as THREE from "three";

export const MOON_RADIUS_M = 1_737_400;
export const DEG = Math.PI / 180;

/** Half-extent (m) of the baked polar-stereographic caps. Keep in sync with scripts/bake-textures.mjs. */
export const CAP_HALF_M = { outer: 400_000, inner: 40_000 } as const;

export const norm360 = (a: number) => ((a % 360) + 360) % 360;
/** Signed smallest difference b - a in degrees, in (-180, 180]. */
export const angDiff = (a: number, b: number) => {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
};

/**
 * Lat/lon (deg, east-positive) → point on a unit-ish sphere, matching the UV
 * layout of THREE.SphereGeometry with an equirectangular texture whose left
 * edge is 180°W. (x = -cos φ sin θ, y = cos θ, z = sin φ sin θ.)
 */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const phi = (norm360(lon + 180) * Math.PI) / 180;
  const theta = (90 - lat) * DEG;
  return out.set(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/** South polar stereographic (sphere), metres. +y = 0°E, +x = 90°E. */
export function stereoSouth(lat: number, lon: number) {
  const rho = 2 * MOON_RADIUS_M * Math.tan(((90 + lat) * DEG) / 2);
  return { x: rho * Math.sin(lon * DEG), y: rho * Math.cos(lon * DEG) };
}

export function invStereoSouth(x: number, y: number) {
  const rho = Math.hypot(x, y);
  const lat = -90 + (2 * Math.atan(rho / (2 * MOON_RADIUS_M))) / DEG;
  const lon = norm360(Math.atan2(x, y) / DEG);
  return { lat, lon };
}

/**
 * The point on the Moon directly beneath a body (sub-solar / sub-Earth point),
 * from its azimuth/elevation at a site. Spherical "destination point" with
 * angular distance = zenith angle. Exact for the Sun; for Earth it ignores
 * ~1° of parallax — fine for lighting the globe, never used for science.
 */
export function subPoint(siteLat: number, siteLon: number, azDeg: number, elDeg: number) {
  const p1 = siteLat * DEG;
  const z = (90 - elDeg) * DEG;
  const a = azDeg * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(z) + Math.cos(p1) * Math.sin(z) * Math.cos(a));
  const dl = Math.atan2(Math.sin(a) * Math.sin(z) * Math.cos(p1), Math.cos(z) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lon: norm360(siteLon + dl / DEG) };
}

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const c = Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)));
  return (c * MOON_RADIUS_M) / 1000;
}

export function formatLat(lat: number) {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}`;
}
export function formatLon(lonEast: number) {
  const l = norm360(lonEast);
  return l > 180 ? `${(360 - l).toFixed(3)}°W` : `${l.toFixed(3)}°E`;
}

const CARD = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const cardinal = (az: number) => CARD[Math.round(norm360(az) / 22.5) % 16];
