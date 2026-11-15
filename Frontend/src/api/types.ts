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
  /** Observer heights (m) with a precomputed horizon. */
  observer_heights_m?: number[];
  /** Set when the representative point was refined (e.g. moved onto a crest). */
  point_note?: string | null;
  /** NASA context, e.g. "Artemis III candidate region (2024)". */
  context?: string | null;
}

export type SunCriterion = "limb" | "centre" | "full";

/** Planner-adjustable visibility rules. Defaults match the backend's. */
export interface VisSettings {
  sunCriterion: SunCriterion;
  earthMarginDeg: number;
  observerHeightM: number;
}

export const DEFAULT_SETTINGS: VisSettings = { sunCriterion: "centre", earthMarginDeg: 0, observerHeightM: 2 };

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
  /** Visible fraction of the Sun's / Earth's disc (0–1). Absent in older snapshots. */
  sun_disc_fraction?: number;
  earth_disc_fraction?: number;
  sun_distance_km?: number;
  /** Sun centre's angular distance outside Earth's disc (negative = behind Earth: eclipse). */
  sun_eclipse_clearance_deg?: number;
  sun_eclipsed_fraction?: number;
  sun_visible: boolean;
  earth_visible: boolean;
  both_visible: boolean;
}

export interface Window {
  start: string;
  end: string;
  duration_hours: number;
  /** The window touches the start/end of the analysed range (may continue beyond it). */
  clipped_start?: boolean;
  clipped_end?: boolean;
}

export interface BodyStats {
  visible_hours?: number;
  visible_percent?: number;
  longest_visible_hours?: number;
  longest_not_visible_hours?: number;
  /** True duration is at least the value given (cut off by the range). */
  longest_visible_clipped?: boolean;
  longest_not_visible_clipped?: boolean;
}

export interface Analysis {
  site_id: string;
  coordinates?: { latitude_deg: number; longitude_deg: number; elevation_km: number };
  timeline: TimelineRow[];
  windows: { sun: Window[]; earth: Window[]; both: Window[] };
  statistics: { sun: BodyStats; earth: BodyStats; both: BodyStats };
  ephemeris_source?: string;
  terrain_source?: TerrainSource;
  settings?: {
    sun_criterion: SunCriterion;
    earth_margin_deg: number;
    observer_height_m: number;
    thresholds_deg?: { sun: number; earth: number };
  };
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
