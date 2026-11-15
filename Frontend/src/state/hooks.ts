import { useEffect, useMemo } from "react";
import { analysisKey, DAY, useStore, WINDOW_DAYS } from "./store";
import { countdown, sampleAt, toSeries, type Countdown, type SkyState } from "../lib/timeline";
import type { Analysis, DataOrigin } from "../api/types";

export interface SiteSky {
  analysis?: Analysis;
  origin?: DataOrigin;
  status: "loading" | "ready" | "error" | "idle";
  error?: string;
  sky?: SkyState;
  sunCountdown?: Countdown;
  earthCountdown?: Countdown;
  bothCountdown?: Countdown;
}

/** Sky state for a site at an arbitrary time (defaults: global clock, mission start). */
export function useSiteSky(siteId: string | null | undefined, opts?: { start?: string; time?: number }): SiteSky {
  const missionStart = useStore((s) => s.missionStart);
  const globalTime = useStore((s) => s.time);
  const start = opts?.start ?? missionStart;
  const time = opts?.time ?? globalTime;
  const entry = useStore((s) => (siteId ? s.analyses[analysisKey(siteId, start)] : undefined));

  return useMemo(() => {
    if (!siteId || !entry) return { status: "idle" };
    if (entry.status !== "ready" || !entry.data) return { status: entry.status, error: entry.error };
    const a = entry.data;
    const series = toSeries(a);
    const sky = sampleAt(series, time);
    return {
      analysis: a,
      origin: entry.origin,
      status: "ready",
      sky,
      sunCountdown: countdown(a.windows.sun, time, series.end),
      earthCountdown: countdown(a.windows.earth, time, series.end),
      bothCountdown: countdown(a.windows.both, time, series.end),
    };
  }, [siteId, entry, time]);
}

/** Advances the global clock while playing. Mount once. */
export function useClock() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const { time, speed, missionStart, setTime, setPlaying } = useStore.getState();
      const end = Date.parse(missionStart) + WINDOW_DAYS * DAY;
      const next = time + dt * speed * 3_600_000;
      if (next >= end) {
        setTime(end);
        setPlaying(false);
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
