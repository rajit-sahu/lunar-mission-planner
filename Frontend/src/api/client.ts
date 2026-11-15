import type { Analysis, DataOrigin, Horizon, Site } from "./types";
import { demoAnalysis, demoHorizon, DEMO_SITES } from "./demo";

/**
 * API client.
 *
 * Order of preference for every request:
 *   1. live   – the FastAPI backend (proxied at /api by Vite in dev,
 *               or VITE_API_URL in a deployed build)
 *   2. snapshot – JSON saved from the real backend into public/fixtures/
 *               (run `npm run snapshot` while the backend is up)
 *   3. demo   – a clearly labelled synthetic model so the UI never blanks
 *               during a demo. Never presented as science.
 */

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

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

async function withFallback<T>(
  live: () => Promise<T>,
  snapshotPath: string | null,
  demo: () => T,
): Promise<Result<T>> {
  try {
    return { data: await live(), origin: "live" };
  } catch (err) {
    console.warn("[api] live request failed, falling back:", err);
  }
  if (snapshotPath) {
    try {
      return { data: await getJSON<T>(snapshotPath, 5000), origin: "snapshot" };
    } catch {
      /* no snapshot for this request */
    }
  }
  return { data: demo(), origin: "demo" };
}

export function fetchSites(): Promise<Result<Site[]>> {
  return withFallback(
    () => getJSON<Site[]>(`${API}/sites`),
    "/fixtures/sites.json",
    () => DEMO_SITES,
  );
}

export function fetchHorizon(siteId: string): Promise<Result<Horizon>> {
  return withFallback(
    () => getJSON<Horizon>(`${API}/sites/${siteId}/horizon`),
    `/fixtures/${siteId}_horizon.json`,
    () => demoHorizon(siteId),
  );
}

/** start/end as ISO strings. Snapshots are keyed by start date + days. */
export function fetchAnalysis(
  siteId: string,
  start: string,
  end: string,
  stepMinutes: number,
): Promise<Result<Analysis>> {
  const q = new URLSearchParams({ start, end, step_minutes: String(stepMinutes) });
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  const snap = `/fixtures/${siteId}_${start.slice(0, 10)}_${days}d.json`;
  return withFallback(
    () => getJSON<Analysis>(`${API}/sites/${siteId}/analysis?${q}`, 60000),
    snap,
    () => demoAnalysis(siteId, start, end, stepMinutes),
  );
}
