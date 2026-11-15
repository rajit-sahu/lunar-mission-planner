import { useEffect, useMemo, useState } from "react";
import { analysisKey, DAY, DELAYS, isoAddDays, useStore, WINDOW_DAYS, type Scenario } from "../../state/store";
import type { Analysis } from "../../api/types";
import { formatHours, toSeries } from "../../lib/timeline";
import { VisibilityLanes } from "../charts/VisibilityLanes";
import { CloseIcon, PlusIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

type Priority = "both" | "sun" | "earth";

interface Metrics {
  sunPct: number;
  earthPct: number;
  bothPct: number;
  longestSun: number;
  longestDark: number;
  longestEarthOut: number;
  longestBoth: number;
  firstSunsetH: number | null;
  first72Sun: number;
}

function metrics(a: Analysis): Metrics {
  const s = a.statistics;
  const start = Date.parse(a.timeline[0].time);
  const first = a.windows.sun[0];
  const sunAtLanding = !!first && Date.parse(first.start) <= start + 1000;
  const series = toSeries(a);
  let on = 0, n = 0;
  for (let i = 0; i < series.t.length && series.t[i] <= start + 3 * DAY; i++) {
    n++;
    if (series.sunClr[i] > 0) on++;
  }
  return {
    sunPct: s.sun.visible_percent ?? 0,
    earthPct: s.earth.visible_percent ?? 0,
    bothPct: s.both.visible_percent ?? 0,
    longestSun: s.sun.longest_visible_hours ?? 0,
    longestDark: s.sun.longest_not_visible_hours ?? 0,
    longestEarthOut: s.earth.longest_not_visible_hours ?? 0,
    longestBoth: s.both.longest_visible_hours ?? 0,
    firstSunsetH: sunAtLanding ? (Date.parse(first.end) - start) / 3.6e6 : null,
    first72Sun: n ? (100 * on) / n : 0,
  };
}

const ROWS: { key: keyof Metrics; label: string; fmt: (v: number | null) => string; better: "high" | "low"; hint: string }[] = [
  { key: "bothPct", label: "Power + comms", fmt: (v) => `${v?.toFixed(1)}%`, better: "high", hint: "Share of time with both Sun and Earth above terrain" },
  { key: "sunPct", label: "Sunlight", fmt: (v) => `${v?.toFixed(1)}%`, better: "high", hint: "Share of time the Sun is above terrain" },
  { key: "earthPct", label: "Earth in view", fmt: (v) => `${v?.toFixed(1)}%`, better: "high", hint: "Direct-to-Earth line of sight" },
  { key: "first72Sun", label: "Sunlit, first 72 h", fmt: (v) => `${v?.toFixed(0)}%`, better: "high", hint: "Landing and commissioning need power immediately" },
  { key: "firstSunsetH", label: "First sunset after landing", fmt: (v) => (v === null ? "dark at landing" : formatHours(v)), better: "high", hint: "How long until the first loss of sunlight" },
  { key: "longestSun", label: "Longest sunlit stretch", fmt: (v) => formatHours(v ?? 0), better: "high", hint: "Longest continuous sunlight" },
  { key: "longestDark", label: "Longest darkness", fmt: (v) => formatHours(v ?? 0), better: "low", hint: "Sizes batteries and heaters" },
  { key: "longestEarthOut", label: "Longest Earth outage", fmt: (v) => formatHours(v ?? 0), better: "low", hint: "Longest gap without direct-to-Earth comms" },
];

function useScenarioAnalysis(sc: Scenario) {
  return useStore((s) => s.analyses[analysisKey(sc.siteId, sc.start)]);
}

function ScenarioCard({ sc, index }: { sc: Scenario; index: number }) {
  const sites = useStore((s) => s.sites);
  const missionStart = useStore((s) => s.missionStart);
  const time = useStore((s) => s.time);
  const { updateScenario, removeScenario, setTime } = useStore.getState();
  const entry = useScenarioAnalysis(sc);
  const offset = time - Date.parse(missionStart);
  const start = Date.parse(sc.start);
  return (
    <div className="sc" style={{ ["--sc" as string]: sc.color }}>
      <div className="sc__head">
        <span className="sc__tag">{String.fromCharCode(65 + index)}</span>
        <select value={sc.siteId} onChange={(e) => updateScenario(sc.id, { siteId: e.target.value })} aria-label="Site">
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {shortName(s)}
            </option>
          ))}
        </select>
        <input type="date" value={sc.start.slice(0, 10)} onChange={(e) => e.target.value && updateScenario(sc.id, { start: `${e.target.value}T00:00:00Z` })} aria-label="Landing date" />
        <div className="sc__delays">
          {DELAYS.map((d) => (
            <button key={d} className="chip chip--sm" onClick={() => updateScenario(sc.id, { start: isoAddDays(sc.start, d) })}>
              +{d}d
            </button>
          ))}
        </div>
        <button className="btn btn--icon" onClick={() => removeScenario(sc.id)} aria-label="Remove scenario">
          <CloseIcon size={14} />
        </button>
      </div>
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

function DelayGrid({ siteId, base }: { siteId: string; base: string }) {
  const ensure = useStore((s) => s.ensureAnalysis);
  const analyses = useStore((s) => s.analyses);
  const site = useStore((s) => s.sites.find((x) => x.id === siteId));
  const delays = [0, ...DELAYS];
  useEffect(() => {
    delays.forEach((d) => ensure(siteId, isoAddDays(base, d)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, base]);
  const rows = delays.map((d) => {
    const e = analyses[analysisKey(siteId, isoAddDays(base, d))];
    return { d, m: e?.data ? metrics(e.data) : null };
  });
  const baseline = rows[0].m;
  const delta = (v: number, b: number | undefined, better: "high" | "low", unit: string) => {
    if (b === undefined) return null;
    const diff = v - b;
    if (Math.abs(diff) < 0.05) return <span className="muted">±0</span>;
    const good = better === "high" ? diff > 0 : diff < 0;
    return (
      <span className={good ? "pos" : "neg"}>
        {diff > 0 ? "+" : "−"}
        {unit === "%" ? `${Math.abs(diff).toFixed(1)}%` : formatHours(Math.abs(diff))}
      </span>
    );
  };
  return (
    <section className="card">
      <div className="card__head">
        <span>Mission delay simulator · {site ? shortName(site) : ""}</span>
        <span className="small muted">original landing {base.slice(0, 10)}</span>
      </div>
      <table className="kv kv--delay">
        <thead>
          <tr>
            <th>Delay</th>
            <th>Power + comms</th>
            <th>Sunlight</th>
            <th>Sunlit, first 72 h</th>
            <th>Longest darkness</th>
            <th>Longest Earth outage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, m }) => (
            <tr key={d}>
              <th>{d === 0 ? "On time" : `+${d} days`}</th>
              {m ? (
                <>
                  <td className="mono">
                    {m.bothPct.toFixed(1)}% {d > 0 && delta(m.bothPct, baseline?.bothPct, "high", "%")}
                  </td>
                  <td className="mono">
                    {m.sunPct.toFixed(1)}% {d > 0 && delta(m.sunPct, baseline?.sunPct, "high", "%")}
                  </td>
                  <td className="mono">
                    {m.first72Sun.toFixed(0)}% {d > 0 && delta(m.first72Sun, baseline?.first72Sun, "high", "%")}
                  </td>
                  <td className="mono">
                    {formatHours(m.longestDark)} {d > 0 && delta(m.longestDark, baseline?.longestDark, "low", "h")}
                  </td>
                  <td className="mono">
                    {formatHours(m.longestEarthOut)} {d > 0 && delta(m.longestEarthOut, baseline?.longestEarthOut, "low", "h")}
                  </td>
                </>
              ) : (
                <td colSpan={5} className="muted">
                  calculating…
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CompareView() {
  const scenarios = useStore((s) => s.scenarios);
  const sites = useStore((s) => s.sites);
  const analyses = useStore((s) => s.analyses);
  const { addScenario, setView } = useStore.getState();
  const [priority, setPriority] = useState<Priority>("both");
  const [minSun, setMinSun] = useState(48);
  // Libration hides Earth for 1–2 weeks a month at every south-pole site, so outages are long.
  const [maxOutage, setMaxOutage] = useState(240);

  const data = scenarios.map((sc) => {
    const e = analyses[analysisKey(sc.siteId, sc.start)];
    return { sc, m: e?.data ? metrics(e.data) : null };
  });

  /** Scenario ids holding the best value per metric (ties all highlighted). */
  const best = useMemo(() => {
    const out: Partial<Record<keyof Metrics, Set<string>>> = {};
    const ready = data.filter((d) => d.m);
    if (ready.length < 2) return out;
    for (const r of ROWS) {
      const val = (m: Metrics) => (m[r.key] ?? (r.better === "high" ? -1 : Infinity)) as number;
      const vals = ready.map((d) => val(d.m!));
      const target = r.better === "high" ? Math.max(...vals) : Math.min(...vals);
      const winners = ready.filter((d) => Math.abs(val(d.m!) - target) < 0.05);
      if (winners.length < ready.length) out[r.key] = new Set(winners.map((d) => d.sc.id));
    }
    return out;
  }, [data]);

  const passes = (m: Metrics) => m.longestSun >= minSun && m.longestEarthOut <= maxOutage;
  const scoreKey: keyof Metrics = priority === "both" ? "bothPct" : priority === "sun" ? "sunPct" : "earthPct";
  const ranked = data.filter((d) => d.m).sort((a, b) => (Number(passes(b.m!)) - Number(passes(a.m!))) || (b.m![scoreKey] as number) - (a.m![scoreKey] as number));
  const winner = ranked[0];
  const winnerSite = winner && sites.find((s) => s.id === winner.sc.siteId);
  const winnerIdx = winner ? scenarios.indexOf(winner.sc) : -1;

  return (
    <div className="compare">
      <div className="compare__inner">
        <header className="compare__head">
          <div>
            <div className="eyebrow">Scenario comparison</div>
            <h2>Which landing site and date works best?</h2>
            <p className="muted">Each scenario covers the {WINDOW_DAYS} days after its landing date. Timelines are aligned by days since landing.</p>
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
              <ScenarioCard key={sc.id} sc={sc} index={i} />
            ))}
            {scenarios.length === 0 && <div className="muted small">Add a scenario to start comparing.</div>}
          </section>

          <section className="card compare__constraints">
            <div className="card__head">
              <span>Mission constraints</span>
            </div>
            <label className="field-row">
              <span>Optimise for</span>
              <div className="seg">
                {(["both", "sun", "earth"] as Priority[]).map((p) => (
                  <button key={p} className={priority === p ? "seg__btn active" : "seg__btn"} onClick={() => setPriority(p)}>
                    {p === "both" ? "Power + comms" : p === "sun" ? "Power" : "Comms"}
                  </button>
                ))}
              </div>
            </label>
            <label className="field-row">
              <span>
                Need at least <b className="mono">{formatHours(minSun)}</b> of continuous sunlight
              </span>
              <input type="range" min={0} max={240} step={6} value={minSun} onChange={(e) => setMinSun(+e.target.value)} />
            </label>
            <label className="field-row">
              <span>
                Tolerate at most <b className="mono">{formatHours(maxOutage)}</b> without Earth contact
              </span>
              <input type="range" min={0} max={480} step={12} value={maxOutage} onChange={(e) => setMaxOutage(+e.target.value)} />
            </label>
            {winner && winnerSite && (
              <div className={`verdict ${passes(winner.m!) ? "" : "verdict--warn"}`} style={{ ["--sc" as string]: winner.sc.color }}>
                <div className="eyebrow">Recommendation</div>
                <div className="verdict__main">
                  <span className="sc__tag">{String.fromCharCode(65 + winnerIdx)}</span> {shortName(winnerSite)}, landing {winner.sc.start.slice(0, 10)}
                </div>
                <div className="small">
                  {passes(winner.m!)
                    ? `Meets both constraints, with ${(winner.m![scoreKey] as number).toFixed(1)}% ${priority === "both" ? "power + comms" : priority === "sun" ? "sunlight" : "Earth visibility"}.`
                    : "No scenario meets every constraint. This one comes closest. Try another date or site."}
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
          <table className="kv kv--compare">
            <thead>
              <tr>
                <th />
                {data.map(({ sc }, i) => {
                  const site = sites.find((s) => s.id === sc.siteId);
                  return (
                    <th key={sc.id} style={{ ["--sc" as string]: sc.color }}>
                      <span className="sc__tag">{String.fromCharCode(65 + i)}</span> {site ? shortName(site) : sc.siteId}
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
                      {m ? r.fmt(m[r.key] as number | null) : "…"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>Meets constraints</th>
                {data.map(({ sc, m }) => (
                  <td key={sc.id}>{m ? passes(m) ? <span className="badge badge--ok">yes</span> : <span className="badge badge--bad">no</span> : "…"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        {scenarios[0] && <DelayGrid siteId={scenarios[0].siteId} base={scenarios[0].start} />}
      </div>
    </div>
  );
}
