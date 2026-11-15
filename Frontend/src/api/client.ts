import { DEFAULT_SETTINGS, type Analysis, type DataOrigin, type Horizon, type Site, type VisSettings } from "./types";
import { demoAnalysis, demoHorizon, DEMO_SITES } from "./demo";

/**
 * API client.
 *
 * Sources, best first:
 *   1. live     – the FastAPI backend (proxied at /api by Vite in dev,
 *                 or VITE_API_URL in a deployed build)
 *   2. snapshot – JSON saved from the real backend into public/fixtures/
 *                 (`npm run snapshot` while the backend is up)
 *   3. demo     – a clearly labelled synthetic model so the UI never blanks
 *                 during a demo. Never presented as science.
 *
 * Hosted backends on free plans sleep and take ~30–60 s to wake. So on load
 * we ping /health with a short timeout (which also wakes the server). While
 * it is asleep, requests that have a snapshot use it instantly; requests
 * with no snapshot wait for the live backend. We keep pinging until it is up,
 * after which every new request is live.
 */

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

export interface Result<T> {
  data: T;
  origin: DataOrigin;
}

async function getJSON<T>(url: string, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        /* not JSON */
      }
      throw new Error(`${res.status}: ${detail}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---- backend availability -------------------------------------------------

let backendUp = false;
let firstCheck: Promise<boolean> | null = null;

async function ping(timeoutMs: number) {
  try {
    const h = await getJSON<{ status?: string }>(`${API}/health`, timeoutMs);
    backendUp = h.status === "ok";
  } catch {
    backendUp = false;
  }
  return backendUp;
}

/** Resolves quickly with whether the backend is awake; keeps waking it in the background. */
function backendReady(): Promise<boolean> {
  if (!firstCheck) {
    firstCheck = ping(4000).then((up) => {
      if (!up) {
        const retry = setInterval(async () => {
          if (await ping(15000)) clearInterval(retry);
        }, 10000);
        // Give up after ~3 minutes: a backend that is not deployed never wakes.
        setTimeout(() => clearInterval(retry), 180_000);
      }
      return up;
    });
  }
  return firstCheck.then(() => backendUp);
}

/**
 * Deployed builds use precomputed results first: they are the backend's own
 * SPICE + LOLA output, and a free-plan server takes ~4 s per 30-day analysis.
 * Local development stays live-first so the team always sees fresh science.
 * (Re-run `npm run snapshot` after science changes, before deploying.)
 */
const SNAPSHOT_FIRST = !import.meta.env.DEV && import.meta.env.VITE_LIVE_FIRST !== "true";

async function withFallback<T>(
  live: (timeoutMs: number) => Promise<T>,
  snapshotPath: string | null,
  demo: () => T,
): Promise<Result<T>> {
  if (SNAPSHOT_FIRST && snapshotPath) {
    void backendReady(); // wake the server for requests that have no snapshot
    try {
      return { data: await getJSON<T>(snapshotPath, 8000), origin: "snapshot" };
    } catch {
      /* not precomputed: use the backend */
    }
  }
  const up = await backendReady();
  if (up) {
    try {
      return { data: await live(60000), origin: "live" };
    } catch (err) {
      console.warn("[api] live request failed, falling back:", err);
    }
  }
  if (snapshotPath) {
    try {
      return { data: await getJSON<T>(snapshotPath, 8000), origin: "snapshot" };
    } catch {
      /* no snapshot for this request */
    }
  }
  if (!up) {
    // No snapshot: worth waiting for a sleeping backend to wake rather than showing demo data.
    try {
      return { data: await live(75000), origin: "live" };
    } catch (err) {
      console.warn("[api] backend unavailable:", err);
    }
  }
  return { data: demo(), origin: "demo" };
}

export function fetchSites(): Promise<Result<Site[]>> {
  return withFallback(
    (t) => getJSON<Site[]>(`${API}/sites`, t),
    "/fixtures/sites.json",
    () => DEMO_SITES,
  );
}

export const isDefaultSettings = (v: VisSettings) =>
  v.sunCriterion === DEFAULT_SETTINGS.sunCriterion &&
  v.earthMarginDeg === DEFAULT_SETTINGS.earthMarginDeg &&
  v.observerHeightM === DEFAULT_SETTINGS.observerHeightM;

export function fetchHorizon(siteId: string, heightM = DEFAULT_SETTINGS.observerHeightM): Promise<Result<Horizon>> {
  const isDefault = heightM === DEFAULT_SETTINGS.observerHeightM;
  return withFallback(
    (t) => getJSON<Horizon>(`${API}/sites/${siteId}/horizon?observer_height_m=${heightM}`, t),
    isDefault ? `/fixtures/${siteId}_horizon.json` : null,
    () => demoHorizon(siteId),
  );
}

/**
 * start/end as ISO strings. Snapshots exist only for the default visibility
 * settings, keyed by start date + days; other settings always come from the backend.
 */
export function fetchAnalysis(
  siteId: string,
  start: string,
  end: string,
  stepMinutes: number,
  settings: VisSettings = DEFAULT_SETTINGS,
): Promise<Result<Analysis>> {
  const q = new URLSearchParams({
    start,
    end,
    step_minutes: String(stepMinutes),
    sun_criterion: settings.sunCriterion,
    earth_margin_deg: String(settings.earthMarginDeg),
    observer_height_m: String(settings.observerHeightM),
  });
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  const snap = isDefaultSettings(settings) ? `/fixtures/${siteId}_${start.slice(0, 10)}_${days}d.json` : null;
  return withFallback(
    (t) => getJSON<Analysis>(`${API}/sites/${siteId}/analysis?${q}`, t),
    snap,
    () => demoAnalysis(siteId, start, end, stepMinutes),
  );
}
