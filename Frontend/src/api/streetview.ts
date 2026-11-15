import { useEffect, useState } from "react";

/** One place you can stand, from Terrain/scripts/streetview_points.py. */
export interface SvPoint {
  id: string;
  label: string;
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number | null;
  /** 360 terrain elevation angles (deg), azimuth 0..359, observer 2 m up. */
  horizon: number[];
  distance_m: number;
  bearing_from_landing_deg: number;
  /** Height relative to the landing point (m). */
  dz_m: number;
  map_px: [number, number];
  /** Direction of local north on the minimap, clockwise from image-up. */
  map_north_deg: number;
  links: { to: string; distance_m: number; bearing_deg: number }[];
}

export interface SvSite {
  site_id: string;
  observer_height_m: number;
  map: { file: string; size_px: number; half_extent_m: number };
  method: string;
  points: SvPoint[];
}

const R = Math.PI / 180;
/** Initial great-circle bearing (deg clockwise from local north). Near the pole this is not the reverse bearing + 180. */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * R, p2 = lat2 * R, dl = (lon2 - lon1) * R;
  const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / R;
  return (b + 360) % 360;
}

/** Make every path two-way, so far viewpoints (e.g. a crater floor) can be walked back from. */
function symmetric(d: SvSite): SvSite {
  const byId = new Map(d.points.map((p) => [p.id, p]));
  for (const p of d.points)
    for (const l of p.links) {
      const q = byId.get(l.to);
      if (q && !q.links.some((x) => x.to === p.id))
        q.links.push({ to: p.id, distance_m: l.distance_m, bearing_deg: bearing(q.lat, q.lon, p.lat, p.lon) });
    }
  return d;
}

const cache = new Map<string, Promise<SvSite | null>>();

function load(siteId: string) {
  let p = cache.get(siteId);
  if (!p) {
    p = fetch(`/streetview/${siteId}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SvSite>) : null))
      .then((d) => (d ? symmetric(d) : null))
      .catch(() => null);
    cache.set(siteId, p);
  }
  return p;
}

export function useStreetView(siteId: string | null | undefined): SvSite | null | undefined {
  const [data, setData] = useState<SvSite | null | undefined>(undefined);
  useEffect(() => {
    if (!siteId) return setData(undefined);
    let live = true;
    setData(undefined);
    load(siteId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [siteId]);
  return data;
}

/** "400 m W" (ring points) reads like a distance, so show "W of landing" instead. */
export const placeName = (label: string) => {
  const m = /^\d+ m ([NSEW]{1,2})$/.exec(label);
  return m ? `${m[1]} of landing` : label.replace(/ \([^)]*\)$/, "");
};

