import { create } from "zustand";
import { fetchAnalysis, fetchHorizon, fetchSites, isDefaultSettings } from "../api/client";
import { DEFAULT_SETTINGS, type Analysis, type DataOrigin, type Horizon, type Site, type VisSettings } from "../api/types";

/**
 * Shared application state. Every view (globe, dashboard, timeline, POV,
 * comparison) reads the same `time` and `selectedSiteId`, so they can never
 * disagree about what moment or place is shown.
 */

/** Two layers: a simple default for everyone, and a mission-planning layer with full detail. */
export type Mode = "discover" | "planner";
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

const settingsKey = (v: VisSettings) => (isDefaultSettings(v) ? "" : `|${v.sunCriterion}|${v.earthMarginDeg}|${v.observerHeightM}`);
export const analysisKey = (siteId: string, start: string, settings: VisSettings = DEFAULT_SETTINGS) =>
  `${siteId}|${start}${settingsKey(settings)}`;
export const horizonKey = (siteId: string, heightM: number) => `${siteId}|${heightM}`;
export const isoAddDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * DAY).toISOString().replace(".000Z", "Z");

const SCENARIO_COLORS = ["#7cc4ff", "#ffb547", "#c792ff"];

function initialMode(): Mode {
  try {
    const q = new URLSearchParams(window.location.search).get("layer");
    if (q === "planner" || q === "discover") return q;
    const saved = localStorage.getItem("lmp-layer");
    if (saved === "planner" || saved === "discover") return saved;
  } catch {
    /* storage unavailable */
  }
  return "discover";
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface State {
  sites: Site[];
  sitesOrigin: DataOrigin | null;
  selectedSiteId: string | null;
  hoveredSiteId: string | null;

  mode: Mode;
  view: View;
  layer: MapLayer;
  settings: VisSettings;

  /** Original landing date chosen by the user. */
  baseStart: string;
  /** Delay applied to the original date (days). */
  delayDays: number;
  /** Effective landing date = baseStart + delayDays: start of the analysed range. */
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
  /** Index of the guided-story step on screen, or null. */
  storyStep: number | null;
  aboutOpen: boolean;

  init: () => Promise<void>;
  selectSite: (id: string | null, fly?: boolean) => void;
  hoverSite: (id: string | null) => void;
  setMode: (m: Mode) => void;
  setView: (v: View) => void;
  setLayer: (l: MapLayer) => void;
  setSettings: (patch: Partial<VisSettings>) => void;
  setBaseStart: (iso: string) => void;
  setDelay: (days: number) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  ensureAnalysis: (siteId: string, start: string) => void;
  ensureHorizon: (siteId: string) => void;
  addScenario: (s?: Partial<Scenario>) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  removeScenario: (id: string) => void;
  setStoryStep: (n: number | null) => void;
  setAboutOpen: (o: boolean) => void;
}

let scenarioSeq = 0;

export const useStore = create<State>((set, get) => ({
  sites: [],
  sitesOrigin: null,
  selectedSiteId: null,
  hoveredSiteId: null,
  mode: initialMode(),
  view: "globe",
  layer: "shade",
  settings: DEFAULT_SETTINGS,
  baseStart: DEFAULT_START,
  delayDays: 0,
  missionStart: DEFAULT_START,
  time: Date.parse(DEFAULT_START) + 2 * DAY,
  playing: false,
  speed: 6,
  analyses: {},
  horizons: {},
  scenarios: [],
  flyToToken: 0,
  storyStep: null,
  aboutOpen: false,

  async init() {
    const { data, origin } = await fetchSites();
    set({ sites: data, sitesOrigin: origin });
    const { missionStart } = get();
    for (const s of data) {
      get().ensureHorizon(s.id);
      get().ensureAnalysis(s.id, missionStart);
    }
    if (get().scenarios.length === 0 && data.length) {
      // The demo story: a landing slips a week. Same site on time vs late, and an alternative site.
      const late = isoAddDays(missionStart, 7);
      get().addScenario({ siteId: data[0].id, start: missionStart });
      get().addScenario({ siteId: data[0].id, start: late });
      const alt = data.find((s) => s.id === "site_malapert") ?? data[2];
      if (alt) get().addScenario({ siteId: alt.id, start: late });
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
  setMode(mode) {
    set({ mode });
    try {
      localStorage.setItem("lmp-layer", mode);
      const url = new URL(window.location.href);
      if (mode === "planner") url.searchParams.set("layer", "planner");
      else url.searchParams.delete("layer");
      window.history.replaceState(null, "", url);
    } catch {
      /* storage or history unavailable */
    }
  },
  setView: (view) => set({ view, playing: view === "compare" ? false : get().playing }),
  setLayer: (layer) => set({ layer }),

  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    const { sites, missionStart, scenarios } = get();
    for (const s of sites) {
      get().ensureHorizon(s.id);
      get().ensureAnalysis(s.id, missionStart);
    }
    for (const sc of scenarios) get().ensureAnalysis(sc.siteId, sc.start);
  },

  setBaseStart(iso) {
    const { missionStart, time } = get();
    const offset = Math.min(Math.max(time - Date.parse(missionStart), 0), WINDOW_DAYS * DAY);
    set({ baseStart: iso, delayDays: 0, missionStart: iso, time: Date.parse(iso) + offset });
    for (const s of get().sites) get().ensureAnalysis(s.id, iso);
  },

  /** Delays are always measured from the original landing date, never stacked. */
  setDelay(days) {
    const { baseStart, missionStart, time } = get();
    const offset = Math.min(Math.max(time - Date.parse(missionStart), 0), WINDOW_DAYS * DAY);
    const start = isoAddDays(baseStart, days);
    set({ delayDays: days, missionStart: start, time: Date.parse(start) + offset });
    for (const s of get().sites) get().ensureAnalysis(s.id, start);
  },

  setTime(t) {
    const start = Date.parse(get().missionStart);
    set({ time: Math.min(Math.max(t, start), start + WINDOW_DAYS * DAY) });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),

  ensureAnalysis(siteId, start) {
    const settings = get().settings;
    const key = analysisKey(siteId, start, settings);
    if (get().analyses[key]) return;
    set((s) => ({ analyses: { ...s.analyses, [key]: { status: "loading" } } }));
    fetchAnalysis(siteId, start, isoAddDays(start, WINDOW_DAYS), STEP_MINUTES, settings)
      .then(({ data, origin }) =>
        set((s) => ({ analyses: { ...s.analyses, [key]: { status: "ready", data, origin } } })),
      )
      .catch((err) =>
        set((s) => ({ analyses: { ...s.analyses, [key]: { status: "error", error: String(err) } } })),
      );
  },

  ensureHorizon(siteId) {
    const h = get().settings.observerHeightM;
    const key = horizonKey(siteId, h);
    if (get().horizons[key]) return;
    fetchHorizon(siteId, h)
      .then(({ data }) => set((s) => ({ horizons: { ...s.horizons, [key]: data } })))
      .catch((err) => console.warn("[horizon] unavailable:", err));
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
  setStoryStep: (storyStep) => set({ storyStep }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
}));

/** Analysis for a site at a landing date under the current visibility settings. */
export function useAnalysisEntry(siteId: string | null | undefined, start?: string): AnalysisEntry | undefined {
  return useStore((s) => (siteId ? s.analyses[analysisKey(siteId, start ?? s.missionStart, s.settings)] : undefined));
}

/** Horizon for a site at the current observer height. */
export function useHorizon(siteId: string | null | undefined): Horizon | undefined {
  return useStore((s) => (siteId ? s.horizons[horizonKey(siteId, s.settings.observerHeightM)] : undefined));
}
