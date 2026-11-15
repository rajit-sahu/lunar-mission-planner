import { create } from "zustand";
import { fetchAnalysis, fetchHorizon, fetchSites } from "../api/client";
import type { Analysis, DataOrigin, Horizon, Site } from "../api/types";

/**
 * Shared application state. Every view (globe, dashboard, timeline, POV,
 * comparison) reads the same `time` and `selectedSiteId`, so they can never
 * disagree about what moment or place is shown.
 */

export type Mode = "explore" | "analyse";
export type View = "globe" | "surface" | "compare";
export type MapLayer = "shade" | "wac" | "illum" | "earthvis";

export const DAY = 86_400_000;
export const DEFAULT_START = "2028-11-20T00:00:00Z";
export const WINDOW_DAYS = 30;
export const STEP_MINUTES = 30;
export const DELAYS = [3, 7, 14, 30] as const;

export interface Scenario {
  id: string;
  siteId: string;
  /** Landing date (ISO). The analysed range is [start, start + WINDOW_DAYS]. */
  start: string;
  color: string;
}

export interface AnalysisEntry {
  status: "loading" | "ready" | "error";
  data?: Analysis;
  origin?: DataOrigin;
  error?: string;
}

export const analysisKey = (siteId: string, start: string) => `${siteId}|${start}`;
export const isoAddDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * DAY).toISOString().replace(".000Z", "Z");

const SCENARIO_COLORS = ["#7cc4ff", "#ffb547", "#c792ff"];

interface State {
  sites: Site[];
  sitesOrigin: DataOrigin | null;
  selectedSiteId: string | null;
  hoveredSiteId: string | null;

  mode: Mode;
  view: View;
  layer: MapLayer;

  /** Landing date: start of the analysed range. */
  missionStart: string;
  /** Global clock (ms since epoch, UTC). */
  time: number;
  playing: boolean;
  /** Simulated hours per real second. */
  speed: number;

  analyses: Record<string, AnalysisEntry>;
  horizons: Record<string, Horizon>;
  scenarios: Scenario[];
  flyToToken: number;

  init: () => Promise<void>;
  selectSite: (id: string | null, fly?: boolean) => void;
  hoverSite: (id: string | null) => void;
  setMode: (m: Mode) => void;
  setView: (v: View) => void;
  setLayer: (l: MapLayer) => void;
  setMissionStart: (iso: string, keepOffset?: boolean) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  ensureAnalysis: (siteId: string, start: string) => void;
  ensureHorizon: (siteId: string) => void;
  addScenario: (s?: Partial<Scenario>) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  removeScenario: (id: string) => void;
}

let scenarioSeq = 0;

export const useStore = create<State>((set, get) => ({
  sites: [],
  sitesOrigin: null,
  selectedSiteId: null,
  hoveredSiteId: null,
  mode: "explore",
  view: "globe",
  layer: "shade",
  missionStart: DEFAULT_START,
  time: Date.parse(DEFAULT_START) + 2 * DAY,
  playing: false,
  speed: 6,
  analyses: {},
  horizons: {},
  scenarios: [],
  flyToToken: 0,

  async init() {
    const { data, origin } = await fetchSites();
    set({ sites: data, sitesOrigin: origin });
    const { missionStart } = get();
    for (const s of data) {
      get().ensureHorizon(s.id);
      get().ensureAnalysis(s.id, missionStart);
    }
    if (get().scenarios.length === 0 && data.length) {
      // A ready-made "7-day delay" comparison for the demo story.
      get().addScenario({ siteId: data[0].id, start: missionStart });
      get().addScenario({ siteId: data[0].id, start: isoAddDays(missionStart, 7) });
      if (data[2]) get().addScenario({ siteId: data[2].id, start: missionStart });
    }
  },

  selectSite(id, fly = true) {
    set((s) => ({ selectedSiteId: id, flyToToken: fly ? s.flyToToken + 1 : s.flyToToken }));
    if (id) {
      get().ensureHorizon(id);
      get().ensureAnalysis(id, get().missionStart);
    }
  },
  hoverSite: (id) => set({ hoveredSiteId: id }),
  setMode: (mode) => set({ mode }),
  setView: (view) => set({ view, playing: view === "compare" ? false : get().playing }),
  setLayer: (layer) => set({ layer }),

  setMissionStart(iso, keepOffset = true) {
    const { missionStart, time } = get();
    const offset = keepOffset ? time - Date.parse(missionStart) : 0;
    const clamped = Math.min(Math.max(offset, 0), WINDOW_DAYS * DAY);
    set({ missionStart: iso, time: Date.parse(iso) + clamped });
    for (const s of get().sites) get().ensureAnalysis(s.id, iso);
  },

  setTime(t) {
    const start = Date.parse(get().missionStart);
    set({ time: Math.min(Math.max(t, start), start + WINDOW_DAYS * DAY) });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),

  ensureAnalysis(siteId, start) {
    const key = analysisKey(siteId, start);
    if (get().analyses[key]) return;
    set((s) => ({ analyses: { ...s.analyses, [key]: { status: "loading" } } }));
    fetchAnalysis(siteId, start, isoAddDays(start, WINDOW_DAYS), STEP_MINUTES)
      .then(({ data, origin }) =>
        set((s) => ({ analyses: { ...s.analyses, [key]: { status: "ready", data, origin } } })),
      )
      .catch((err) =>
        set((s) => ({ analyses: { ...s.analyses, [key]: { status: "error", error: String(err) } } })),
      );
  },

  ensureHorizon(siteId) {
    if (get().horizons[siteId]) return;
    fetchHorizon(siteId).then(({ data }) => set((s) => ({ horizons: { ...s.horizons, [siteId]: data } })));
  },

  addScenario(partial) {
    const { scenarios, sites, missionStart } = get();
    if (scenarios.length >= 3) return;
    const used = new Set(scenarios.map((s) => s.color));
    const sc: Scenario = {
      id: `sc${++scenarioSeq}`,
      siteId: partial?.siteId ?? get().selectedSiteId ?? sites[0]?.id ?? "",
      start: partial?.start ?? missionStart,
      color: SCENARIO_COLORS.find((c) => !used.has(c)) ?? SCENARIO_COLORS[0],
    };
    set({ scenarios: [...scenarios, sc] });
    get().ensureAnalysis(sc.siteId, sc.start);
  },
  updateScenario(id, patch) {
    set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    const sc = get().scenarios.find((x) => x.id === id);
    if (sc) get().ensureAnalysis(sc.siteId, sc.start);
  },
  removeScenario: (id) => set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })),
}));

/** Selected site's analysis for the current mission start, if loaded. */
export function useCurrentAnalysis(siteId?: string | null): AnalysisEntry | undefined {
  return useStore((s) => {
    const id = siteId ?? s.selectedSiteId;
    return id ? s.analyses[analysisKey(id, s.missionStart)] : undefined;
  });
}
