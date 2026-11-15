import { useEffect, useMemo, useState } from "react";
import { analysisKey, isoAddDays, useStore } from "../../state/store";
import { DEFAULT_CONSTRAINTS, delaySentence, fmtH, missionMetrics, rank, type Candidate } from "../../lib/metrics";
import { CombinedStrip, StripLegend } from "../charts/CombinedStrip";
import { CloseIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

const OPTIONS = [3, 7, 14, 30];

/**
 * Discover layer: "What if the landing slips?" in plain language. One site,
 * on time vs late, plus which site would be the better choice if late.
 */
export function LateView() {
  const sites = useStore((s) => s.sites);
  const selected = useStore((s) => s.selectedSiteId);
  const baseStart = useStore((s) => s.baseStart);
  const settings = useStore((s) => s.settings);
  const analyses = useStore((s) => s.analyses);
  const { ensureAnalysis, setView, setMode, selectSite } = useStore.getState();
  const [days, setDays] = useState(7);
  const siteId = selected ?? sites[0]?.id;
  const late = isoAddDays(baseStart, days);

  useEffect(() => {
    for (const s of sites) {
      ensureAnalysis(s.id, baseStart);
      ensureAnalysis(s.id, late);
    }
  }, [sites, baseStart, late, settings, ensureAnalysis]);

  const get = (id: string, start: string) => analyses[analysisKey(id, start, settings)]?.data;
  const onTimeA = siteId ? get(siteId, baseStart) : undefined;
  const lateA = siteId ? get(siteId, late) : undefined;
  const sentence = onTimeA && lateA ? delaySentence(missionMetrics(onTimeA), missionMetrics(lateA), days) : null;

  const best = useMemo(() => {
    const cands: Candidate[] = [];
    for (const s of sites) {
      const a = get(s.id, late);
      if (!a) return null;
      cands.push({ id: s.id, label: shortName(s), m: missionMetrics(a), slopeDeg: s.slope_deg });
    }
    return rank(cands, DEFAULT_CONSTRAINTS, "both");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, late, analyses, settings]);
  const top = best?.[0];
  const topSite = top && sites.find((s) => s.id === top.id);
  const topM = topSite && get(topSite.id, late) ? missionMetrics(get(topSite.id, late)!) : null;

  return (
    <div className="compare">
      <div className="compare__inner compare__inner--narrow">
        <header className="compare__head">
          <div>
            <div className="eyebrow">What if the landing slips?</div>
            <h2>Rockets and landers often run late. Does it matter?</h2>
            <p className="muted">At the south pole, a few days can decide whether a lander arrives in sunlight and can talk to Earth.</p>
          </div>
          <button className="btn" onClick={() => setView("globe")}>
            <CloseIcon size={14} /> Back to map
          </button>
        </header>

        <section className="card">
          <div className="late__controls">
            <label>
              Site{" "}
              <select value={siteId ?? ""} onChange={(e) => selectSite(e.target.value, false)} aria-label="Site">
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortName(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="group" aria-label="How late">
              {OPTIONS.map((d) => (
                <button key={d} aria-pressed={days === d} className={days === d ? "seg__btn active" : "seg__btn"} onClick={() => setDays(d)}>
                  {d === 7 ? "1 week" : d === 14 ? "2 weeks" : d === 30 ? "1 month" : `${d} days`} late
                </button>
              ))}
            </div>
          </div>
          <div className="late__rows">
            <div className="late__label">
              On time
              <span className="small muted mono">{baseStart.slice(0, 10)}</span>
            </div>
            <CombinedStrip analysis={onTimeA} label="On time" />
            <div className="late__label">
              {days} days late
              <span className="small muted mono">{late.slice(0, 10)}</span>
            </div>
            <CombinedStrip analysis={lateA} label={`${days} days late`} />
            <div />
            <div className="late__axis small muted">
              <span>Landing</span>
              <span>Day 10</span>
              <span>Day 20</span>
              <span>Day 30</span>
            </div>
          </div>
          <StripLegend />
          <p className="late__sentence" aria-live="polite">
            {sentence ?? "Working it out…"}
          </p>
        </section>

        {topSite && topM && (
          <section className="card late__best">
            <div className="eyebrow">If we land {days} days late</div>
            <h3>
              {top!.passes ? "Best choice" : "Closest option"}: {shortName(topSite)}
              {topSite.id === siteId ? " (same site)" : ""}
            </h3>
            <p>
              {topM.sunAtLanding
                ? `Sunlight for about ${fmtH(topM.firstSunsetH)} after touchdown`
                : `Lands in darkness; the Sun rises after ${fmtH(topM.firstSunriseH)}`}
              {topM.earthAtLanding ? ", with Earth in view at landing." : ", but Earth is hidden at landing."}
            </p>
            <div className="late__actions">
              {topSite.id !== siteId && (
                <button className="btn" onClick={() => selectSite(topSite.id, false)}>
                  Compare with {shortName(topSite)}
                </button>
              )}
              <button
                className="btn"
                onClick={() => {
                  setMode("planner");
                  setView("compare");
                }}
              >
                See the numbers (Mission planner)
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
