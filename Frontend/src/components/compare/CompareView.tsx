import { useEffect, useState } from "react";
import { analysisKey, DAY, DELAYS, isoAddDays, useStore, WINDOW_DAYS, type Scenario } from "../../state/store";
import type { Site } from "../../api/types";
import {
  DEFAULT_CONSTRAINTS,
  fmtH,
  missionMetrics,
  rank,
  type Candidate,
  type Constraints,
  type MissionMetrics,
  type Priority,
} from "../../lib/metrics";
import { VisibilityLanes } from "../charts/VisibilityLanes";
import { CloseIcon, PlusIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

type Row = {
  key: keyof MissionMetrics;
  label: string;
  hint: string;
  better: "high" | "low";
  fmt: (m: MissionMetrics) => string;
};

const pct = (v: number) => `${v.toFixed(0)}%`;
const ROWS: Row[] = [
  { key: "sunAtLanding", label: "Sunlit at touchdown", hint: "Power from the first minute", better: "high", fmt: (m) => (m.sunAtLanding ? "yes" : `no · rises in ${fmtH(m.firstSunriseH)}`) },
  { key: "firstSunsetH", label: "Sunlight from touchdown", hint: "Hours until the first sunset after landing", better: "high", fmt: (m) => (m.sunAtLanding ? `${m.firstSunsetAtLeast ? "≥ " : ""}${fmtH(m.firstSunsetH)}` : "—") },
  { key: "earthAtLanding", label: "Earth in view at touchdown", hint: "Direct radio link during descent and landing", better: "high", fmt: (m) => (m.earthAtLanding ? "yes" : "no") },
  { key: "first72Both", label: "Power + radio, first 72 h", hint: "Share of the first three days with both Sun and Earth above terrain", better: "high", fmt: (m) => pct(m.first72Both) },
  { key: "earthGap7dH", label: "Longest radio gap, week 1", hint: "Longest time without Earth in the first 7 days", better: "low", fmt: (m) => fmtH(m.earthGap7dH) },
  { key: "energy7dWhPerM2Day", label: "Solar energy, week 1", hint: "Average per day on 1 m² of vertical Sun-tracking panel, before losses", better: "high", fmt: (m) => `${(m.energy7dWhPerM2Day / 1000).toFixed(1)} kWh/m²/day` },
  { key: "sunPct", label: "Sunlight, 30 days", hint: "Share of the 30 days after landing", better: "high", fmt: (m) => pct(m.sunPct) },
  { key: "longestDarkH", label: "Longest darkness, 30 days", hint: "Sizes batteries and heaters", better: "low", fmt: (m) => `${m.longestDarkAtLeast ? "≥ " : ""}${fmtH(m.longestDarkH)}` },
];

const value = (m: MissionMetrics, k: keyof MissionMetrics) => Number(m[k]);


function ScenarioCard({ sc, index, verdict }: { sc: Scenario; index: number; verdict?: { passes: boolean; failures: string[] } }) {
  const sites = useStore((s) => s.sites);
  const missionStart = useStore((s) => s.missionStart);
  const time = useStore((s) => s.time);
  const { updateScenario, removeScenario, setTime } = useStore.getState();
  const entry = useStore((s) => s.analyses[analysisKey(sc.siteId, sc.start, s.settings)]);
  const offset = time - Date.parse(missionStart);
  const start = Date.parse(sc.start);
  return (
    <div className="sc" style={{ ["--sc" as string]: sc.color }}>
      <div className="sc__head">
        <span className="sc__tag">{String.fromCharCode(65 + index)}</span>
        <select value={sc.siteId} onChange={(e) => updateScenario(sc.id, { siteId: e.target.value })} aria-label={`Scenario ${index + 1} site`}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {shortName(s)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={sc.start.slice(0, 10)}
          onChange={(e) => e.target.value && updateScenario(sc.id, { start: `${e.target.value}T00:00:00Z` })}
          aria-label={`Scenario ${index + 1} landing date`}
        />
        <div className="sc__delays">
          {DELAYS.map((d) => (
            <button key={d} className="chip chip--sm" onClick={() => updateScenario(sc.id, { start: isoAddDays(sc.start, d) })} title={`Push this landing back ${d} days`}>
              +{d}d
            </button>
          ))}
        </div>
        <button className="btn btn--icon" onClick={() => removeScenario(sc.id)} aria-label={`Remove scenario ${index + 1}`}>
          <CloseIcon size={14} />
        </button>
      </div>
      {verdict && (
        <div className={`sc__verdict ${verdict.passes ? "ok" : "fail"}`}>
          {verdict.passes ? "✓ Meets every constraint" : `✗ ${verdict.failures.join(" · ")}`}
        </div>
      )}
      <VisibilityLanes
        analysis={entry?.data}
        start={start}
        end={start + WINDOW_DAYS * DAY}
        time={start + offset}
        onScrub={(t) => setTime(Date.parse(missionStart) + (t - start))}
        relative
        laneHeight={11}
        loading={entry?.status === "loading"}
      />
    </div>
  );
}

/** For each delay, which site would be the best choice? */
function DelayGrid({ base, constraints, priority }: { base: string; constraints: Constraints; priority: Priority }) {
  const sites = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const analyses = useStore((s) => s.analyses);
  const ensure = useStore((s) => s.ensureAnalysis);
  const delays = [0, ...DELAYS];
  useEffect(() => {
    for (const s of sites) for (const d of delays) ensure(s.id, isoAddDays(base, d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, base, settings]);

  const rows = delays.map((d) => {
    const start = isoAddDays(base, d);
    const cands: Candidate[] = [];
    let missing = false;
    for (const s of sites) {
      const e = analyses[analysisKey(s.id, start, settings)];
      if (!e?.data) {
        missing = true;
        continue;
      }
      cands.push({ id: s.id, label: shortName(s), m: missionMetrics(e.data), slopeDeg: s.slope_deg });
    }
    return { d, start, cands, missing, verdicts: missing ? [] : rank(cands, constraints, priority) };
  });

  const name = (id: string) => sites.find((s) => s.id === id);
  return (
    <section className="card">
      <div className="card__head">
        <span>Mission delay simulator: best site for each landing date</span>
        <span className="small muted">original landing {base.slice(0, 10)}</span>
      </div>
      <table className="kv kv--delay">
        <thead>
          <tr>
            <th>Landing</th>
            <th>Best choice</th>
            {sites.map((s) => (
              <th key={s.id}>{shortName(s)}: sunlight from touchdown</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, start, cands, missing, verdicts }) => {
            const top = verdicts[0];
            const site = top && name(top.id);
            return (
              <tr key={d}>
                <th>
                  {d === 0 ? "On time" : `+${d} days`}
                  <div className="small muted mono">{start.slice(0, 10)}</div>
                </th>
                <td className="delay-best">
                  {missing ? (
                    <span className="muted">calculating…</span>
                  ) : top?.passes ? (
                    <span className="best-pill" title={top.tiedWith.length ? "Tied on the main score; ordered by sunlight after touchdown" : undefined}>
                      {site ? shortName(site) : top.id}
                      {top.tiedWith.length > 0 && <span className="small"> (tie)</span>}
                    </span>
                  ) : (
                    <span className="warn-pill" title={top?.failures.join(" · ")}>
                      none fully fits · closest: {site ? shortName(site) : "—"}
                    </span>
                  )}
                </td>
                {sites.map((s) => {
                  const c = cands.find((x) => x.id === s.id);
                  const v = verdicts.find((x) => x.id === s.id);
                  return (
                    <td key={s.id} className="mono" title={v?.failures.join(" · ") || "meets every constraint"}>
                      {c ? (c.m.sunAtLanding ? `${c.m.firstSunsetAtLeast ? "≥" : ""}${fmtH(c.m.firstSunsetH)}` : "dark") : "…"}{" "}
                      {v && <span className={v.passes ? "pos" : "neg"}>{v.passes ? "✓" : "✗"}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">✓ meets every constraint, ✗ fails at least one (hover for why). "≥" means the sunlight lasts beyond the 30-day window.</p>
    </section>
  );
}

export function CompareView() {
  const scenarios = useStore((s) => s.scenarios);
  const sites = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const analyses = useStore((s) => s.analyses);
  const baseStart = useStore((s) => s.baseStart);
  const { addScenario, setView } = useStore.getState();
  const [priority, setPriority] = useState<Priority>("both");
  const [k, setK] = useState<Constraints>(DEFAULT_CONSTRAINTS);

  const site = (id: string): Site | undefined => sites.find((s) => s.id === id);
  const data = scenarios.map((sc) => {
    const e = analyses[analysisKey(sc.siteId, sc.start, settings)];
    return { sc, m: e?.data ? missionMetrics(e.data) : null };
  });
  const cands: Candidate[] = data
    .filter((d) => d.m)
    .map((d) => ({ id: d.sc.id, label: d.sc.siteId, m: d.m!, slopeDeg: site(d.sc.siteId)?.slope_deg ?? null }));
  const verdicts = rank(cands, k, priority);
  const verdictOf = (id: string) => verdicts.find((v) => v.id === id);
  const winner = verdicts[0];
  const winnerSc = winner && scenarios.find((s) => s.id === winner.id);
  const winnerIdx = winnerSc ? scenarios.indexOf(winnerSc) : -1;

  // Best value per row (ties all highlighted).
  const best: Partial<Record<keyof MissionMetrics, Set<string>>> = {};
  const ready = data.filter((d) => d.m);
  if (ready.length > 1)
    for (const r of ROWS) {
      const vals = ready.map((d) => value(d.m!, r.key));
      const target = r.better === "high" ? Math.max(...vals) : Math.min(...vals);
      const winners = ready.filter((d) => Math.abs(value(d.m!, r.key) - target) < 0.05);
      if (winners.length < ready.length) best[r.key] = new Set(winners.map((d) => d.sc.id));
    }

  const set = (patch: Partial<Constraints>) => setK((c) => ({ ...c, ...patch }));

  return (
    <div className="compare">
      <div className="compare__inner">
        <header className="compare__head">
          <div>
            <div className="eyebrow">Scenario comparison</div>
            <h2>Which landing site and date works best?</h2>
            <p className="muted">
              Every number is measured from touchdown. Each scenario covers the {WINDOW_DAYS} days after its landing date, and timelines are aligned by days since landing.
            </p>
          </div>
          <button className="btn" onClick={() => setView("globe")}>
            <CloseIcon size={14} /> Back to map
          </button>
        </header>

        <div className="compare__grid">
          <section className="card compare__scenarios">
            <div className="card__head">
              <span>Scenarios</span>
              {scenarios.length < 3 && (
                <button className="btn btn--small" onClick={() => addScenario()}>
                  <PlusIcon size={14} /> Add scenario
                </button>
              )}
            </div>
            {scenarios.map((sc, i) => (
              <ScenarioCard key={sc.id} sc={sc} index={i} verdict={verdictOf(sc.id)} />
            ))}
            {scenarios.length === 0 && <div className="muted small">Add a scenario to start comparing.</div>}
          </section>

          <section className="card compare__constraints">
            <div className="card__head">
              <span>Mission constraints</span>
              <button className="btn btn--small" onClick={() => setK(DEFAULT_CONSTRAINTS)}>
                Reset
              </button>
            </div>
            <div className="field-row">
              <span id="prio-label">When several fit, prefer</span>
              <div className="seg" role="group" aria-labelledby="prio-label">
                {(["both", "sun", "earth"] as Priority[]).map((p) => (
                  <button key={p} aria-pressed={priority === p} className={priority === p ? "seg__btn active" : "seg__btn"} onClick={() => setPriority(p)}>
                    {p === "both" ? "Power + radio" : p === "sun" ? "Longest sunlight" : "Radio"}
                  </button>
                ))}
              </div>
            </div>
            <label className="field-row">
              <span>
                Sunlight needed from touchdown: <b className="mono">{fmtH(k.minSunFromLandingH)}</b>
              </span>
              <input type="range" min={0} max={336} step={6} value={k.minSunFromLandingH} onChange={(e) => set({ minSunFromLandingH: +e.target.value })} />
            </label>
            <label className="field-row">
              <span>
                Longest radio gap allowed in week 1: <b className="mono">{fmtH(k.maxEarthGap7dH)}</b>
              </span>
              <input type="range" min={0} max={168} step={6} value={k.maxEarthGap7dH} onChange={(e) => set({ maxEarthGap7dH: +e.target.value })} />
            </label>
            <label className="field-row">
              <span>
                Steepest ground the lander tolerates: <b className="mono">{k.maxSlopeDeg}°</b>{" "}
                <span className="small muted">(NASA's Artemis III limit is under 10°)</span>
              </span>
              <input type="range" min={2} max={20} step={1} value={k.maxSlopeDeg} onChange={(e) => set({ maxSlopeDeg: +e.target.value })} />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={k.earthAtLanding} onChange={(e) => set({ earthAtLanding: e.target.checked })} />
              Earth must be in view at touchdown
            </label>
            {winner && winnerSc && (
              <div className={`verdict ${winner.passes ? "" : "verdict--warn"}`} style={{ ["--sc" as string]: winnerSc.color }} aria-live="polite">
                <div className="eyebrow">Recommendation</div>
                <div className="verdict__main">
                  <span className="sc__tag">{String.fromCharCode(65 + winnerIdx)}</span> {site(winnerSc.siteId) ? shortName(site(winnerSc.siteId)!) : winnerSc.siteId}, landing {winnerSc.start.slice(0, 10)}
                </div>
                <div className="small">
                  {winner.passes
                    ? `Meets every constraint. ${verdicts.filter((v) => !v.passes).length ? `The others fail: ${verdicts.filter((v) => !v.passes).map((v) => `${String.fromCharCode(65 + scenarios.findIndex((s) => s.id === v.id))} (${v.failures[0]})`).join("; ")}.` : ""}`
                    : `No scenario meets every constraint; this one comes closest (${winner.failures.join(", ")}). Try another date or site, or relax a constraint.`}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="card">
          <div className="card__head">
            <span>Side by side</span>
            <span className="small muted">best value highlighted</span>
          </div>
          <div className="table-scroll">
            <table className="kv kv--compare">
              <thead>
                <tr>
                  <th />
                  {data.map(({ sc }, i) => {
                    const s = site(sc.siteId);
                    return (
                      <th key={sc.id} style={{ ["--sc" as string]: sc.color }}>
                        <span className="sc__tag">{String.fromCharCode(65 + i)}</span> {s ? shortName(s) : sc.siteId}
                        <div className="small muted mono">{sc.start.slice(0, 10)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.key}>
                    <th title={r.hint}>{r.label}</th>
                    {data.map(({ sc, m }) => (
                      <td key={sc.id} className={`mono ${best[r.key]?.has(sc.id) ? "best" : ""}`}>
                        {m ? r.fmt(m) : "…"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th>Slope at the point</th>
                  {data.map(({ sc }) => {
                    const s = site(sc.siteId)?.slope_deg;
                    return (
                      <td key={sc.id} className={`mono ${s != null && s > k.maxSlopeDeg ? "neg" : ""}`}>
                        {s != null ? `${s.toFixed(1)}°` : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th>Meets constraints</th>
                  {data.map(({ sc, m }) => {
                    const v = verdictOf(sc.id);
                    return (
                      <td key={sc.id}>
                        {!m || !v ? "…" : v.passes ? <span className="badge badge--ok">yes</span> : <span className="badge badge--bad">no</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <DelayGrid base={baseStart} constraints={k} priority={priority} />
      </div>
    </div>
  );
}
