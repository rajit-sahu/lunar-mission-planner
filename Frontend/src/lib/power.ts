import { DEG } from "./geo";

/** Mean solar irradiance at 1 AU, W/m². Varies ±3.4% over a year. */
export const SOLAR_CONSTANT = 1361;

export type PanelKind = "vertical-tracking" | "horizontal";

export const PANEL_LABEL: Record<PanelKind, string> = {
  "vertical-tracking": "Vertical panel, turns to face the Sun",
  horizontal: "Flat panel lying on the ground",
};

/**
 * Irradiance on a panel (W/m²) from Sun elevation, if the Sun is above the
 * terrain. Point-source Sun, no losses: potential illumination, not power
 * output. Vertical tracking panels are what south-pole landers use because
 * the Sun stays within a few degrees of the horizon.
 */
export function irradiance(sunElDeg: number, sunVisible: boolean, panel: PanelKind) {
  if (!sunVisible) return 0;
  const f = panel === "horizontal" ? Math.max(0, Math.sin(sunElDeg * DEG)) : Math.cos(sunElDeg * DEG);
  return SOLAR_CONSTANT * f;
}
