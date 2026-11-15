// Types mirroring the FastAPI backend (Backend/README.md).
// Conventions: UTC ISO 8601 times, azimuth clockwise from north 0–360,
// elevation degrees above local horizontal, distances in km.

export type TerrainSource = "lola" | "placeholder";

export interface Site {
  id: string;
  name: string;
  latitude_deg: number;
  longitude_deg: number; // east-positive, 0–360
  elevation_m: number | null;
  slope_deg: number | null;
  source?: string | null;
  note?: string | null;
  terrain_source: TerrainSource;
}

export interface Horizon {
  site_id: string;
  terrain_source: TerrainSource;
  horizon_azimuths: number[];
  horizon_elevations: number[];
}

export interface TimelineRow {
  time: string;
  sun_azimuth_deg: number;
  sun_elevation_deg: number;
  sun_horizon_deg: number;
  sun_clearance_deg: number;
  earth_azimuth_deg: number;
  earth_elevation_deg: number;
  earth_horizon_deg: number;
  earth_clearance_deg: number;
  sun_visible: boolean;
  earth_visible: boolean;
  both_visible: boolean;
}

export interface Window {
  start: string;
  end: string;
  duration_hours: number;
}

export interface BodyStats {
  visible_hours?: number;
  visible_percent?: number;
  longest_visible_hours?: number;
  longest_not_visible_hours?: number;
}

export interface Analysis {
  site_id: string;
  coordinates?: { latitude_deg: number; longitude_deg: number; elevation_km: number };
  timeline: TimelineRow[];
  windows: { sun: Window[]; earth: Window[]; both: Window[] };
  statistics: { sun: BodyStats; earth: BodyStats; both: BodyStats };
  ephemeris_source?: string;
  terrain_source?: TerrainSource;
}

export interface ComparisonRow {
  site_id: string;
  sun_visible_percent: number;
  earth_visible_percent: number;
  both_visible_percent: number;
  longest_darkness_hours: number;
  longest_earth_outage_hours: number;
  longest_simultaneous_visibility_hours: number;
}

/** Where the numbers on screen came from. */
export type DataOrigin = "live" | "snapshot" | "demo";
