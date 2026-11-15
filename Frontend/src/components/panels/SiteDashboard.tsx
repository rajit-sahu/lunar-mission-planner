import { useMemo, useState } from "react";
import { DAY, useHorizon, useStore, WINDOW_DAYS } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { cardinal, DEG, formatLat, formatLon } from "../../lib/geo";
import { formatDuration, formatHours, fmtUTC, type Countdown } from "../../lib/timeline";
import { SOLAR_CONSTANT } from "../../lib/power";
import type { Analysis, Site, SunCriterion } from "../../api/types";
import { SkyChart } from "../charts/SkyChart";
import { ClearanceChart } from "../charts/ClearanceChart";
import { BoltIcon, CloseIcon, EarthIcon, InfoIcon, MountainIcon, SunIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

function countdownText(c: Countdown | undefined, setWord: string, riseWord: string) {
  if (!c) return "";
  if (c.kind === "set") return c.beyondRange ? `${setWord} in more than ${formatDuration(c.ms, true)}` : `${setWord} in ${formatDuration(c.ms)}`;
  if (c.kind === "rise") return `${riseWord} in ${formatDuration(c.ms)}`;
  return `No ${riseWord.toLowerCase()} in the next ${formatDuration(c.ms, true)}`;
}

/** "about 3 days" / "about 14 hours" for casual copy. */
function roughly(ms: number) {
  const h = ms / 3.6e6;
  if (h < 1.5) return "under 2 hours";
  if (h < 36) return `about ${Math.round(h)} hours`;
  return `about ${Math.round(h / 24)} days`;
}

function StatusTile({ kind, visible, text, sub }: { kind: "sun" | "earth" | "both"; visible: boolean; text: string; sub: string }) {
  const Icon = kind === "earth" ? EarthIcon : SunIcon;
  return (
    <div className={`status status--${kind} ${visible ? "is-on" : "is-off"}`}>
      <div className="status__icon">
        {kind === "both" ? (
          <>
            <SunIcon size={15} />
            <EarthIcon size={15} />
          </>
        ) : (
          <Icon size={22} />
        )}
      </div>
      <div className="status__body">
        <div className="status__title">{text}</div>
        <div className="status__sub">{sub}</div>
      </div>
    </div>
  );
}

function summarySentence(sun: boolean, earth: boolean) {
  if (sun && earth) return "A lander here right now would have sunlight for power and a direct radio line to Earth.";
  if (sun) return "Sunlight for power, but Earth is behind the hills, so there is no direct radio link without a relay satellite.";
  if (earth) return "Earth is in view for radio, but the Sun is behind the hills, so the lander runs on batteries and gets colder.";
  return "Neither the Sun nor Earth is visible: no solar power and no direct radio link. Survival mode.";
}

/** Irradiance (W/m²) on a panel, scaled by Sun distance and the visible part of the disc. */
function irradiance(el: number, discFraction: number, distanceKm: number | undefined, panel: "vertical" | "horizontal") {
  const au = distanceKm ? (149_597_870.7 / distanceKm) ** 2 : 1;
  const geom = panel === "horizontal" ? Math.max(0, Math.sin(el * DEG)) : Math.cos(el * DEG);
  return SOLAR_CONSTANT * au * geom * discFraction;
}

/** Nearest timeline sample (for disc fraction / distance, which vary slowly). */
function nearestRow(a: Analysis, t: number) {
  const rows = a.timeline;
  const t0 = Date.parse(rows[0].time);
  const step = (Date.parse(rows[1].time) - t0) || 1;
  return rows[Math.min(rows.length - 1, Math.max(0, Math.round((t - t0) / step)))];
}

function energyNext24h(a: Analysis, t: number, panel: "vertical" | "horizontal") {
  let wh = 0;
  const rows = a.timeline;
  for (let i = 0; i + 1 < rows.length; i++) {
    const ta = Date.parse(rows[i].time);
    if (ta < t) continue;
    if (ta >= t + DAY) break;
    const r = rows[i];
    const frac = r.sun_disc_fraction ?? (r.sun_visible ? 1 : 0);
    wh += irradiance(r.sun_elevation_deg, frac, r.sun_distance_km, panel) * ((Date.parse(rows[i + 1].time) - ta) / 3.6e6);
  }
  return wh;
}

const CRITERIA: { v: SunCriterion; label: string; hint: string }[] = [
  { v: "limb", label: "Top edge", hint: "Any part of the Sun above the terrain" },
  { v: "centre", label: "Centre", hint: "The Sun's centre above the terrain (default)" },
  { v: "full", label: "Whole disc", hint: "The whole Sun above the terrain: full power" },
];

function VisibilityRules({ site }: { site: Site }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const heights = site.observer_heights_m?.length ? site.observer_heights_m : [2];
  return (
    <section className="card">
      <div className="card__head">
        <span>Visibility rules</span>
        <button className="btn btn--small" onClick={() => setSettings({ sunCriterion: "centre", earthMarginDeg: 0, observerHeightM: 2 })}>
          Defaults
        </button>
      </div>
      <div className="rule">
        <span id="rule-sun">Sun counts as up when its…</span>
        <div className="seg" role="group" aria-labelledby="rule-sun">
          {CRITERIA.map((c) => (
            <button key={c.v} title={c.hint} aria-pressed={settings.sunCriterion === c.v} className={settings.sunCriterion === c.v ? "seg__btn active" : "seg__btn"} onClick={() => setSettings({ sunCriterion: c.v })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rule">
        <span id="rule-earth">Earth must clear the terrain by</span>
        <div className="seg" role="group" aria-labelledby="rule-earth">
          {[0, 1, 2, 5].map((m) => (
            <button key={m} aria-pressed={settings.earthMarginDeg === m} className={settings.earthMarginDeg === m ? "seg__btn active" : "seg__btn"} onClick={() => setSettings({ earthMarginDeg: m })}>
              {m}°
            </button>
          ))}
        </div>
      </div>
      <div className="rule">
        <span id="rule-h">Eye / panel / antenna height</span>
        <div className="seg" role="group" aria-labelledby="rule-h">
          {heights.map((h) => (
            <button key={h} aria-pressed={settings.observerHeightM === h} className={settings.observerHeightM === h ? "seg__btn active" : "seg__btn"} onClick={() => setSettings({ observerHeightM: h })}>
              {h} m
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">
        Heights use LOLA horizons computed for that height; nearby ridges matter a lot at the pole, so a tall mast can see the Sun far more often. Non-default rules are calculated live.
      </p>
    </section>
  );
}

function BatteryCheck({ longestDarkH, atLeast }: { longestDarkH: number; atLeast: boolean }) {
  const [loadW, setLoadW] = useState(150);
  const [kwh, setKwh] = useState(10);
  const needKwh = (loadW * longestDarkH) / 1000;
  const ok = kwh >= needKwh;
  return (
    <section className="card">
      <div className="card__head">
        <span>Battery check: longest night</span>
        <span className={`badge ${ok ? "badge--ok" : "badge--bad"}`}>{ok ? "survives" : "runs out"}</span>
      </div>
      <div className="battery">
        <label>
          Load while dark
          <span>
            <input type="number" min={1} max={5000} value={loadW} onChange={(e) => setLoadW(Math.max(1, +e.target.value))} /> W
          </span>
        </label>
        <label>
          Usable battery
          <span>
            <input type="number" min={0.1} max={500} step={0.5} value={kwh} onChange={(e) => setKwh(Math.max(0.1, +e.target.value))} /> kWh
          </span>
        </label>
      </div>
      <p className="small">
        Longest darkness {atLeast ? "is at least" : "is"} <b className="mono">{formatHours(longestDarkH)}</b>, so it needs <b className="mono">{needKwh.toFixed(1)} kWh</b>
        {atLeast ? " or more" : ""}. Heaters, depth-of-discharge and ageing are not included.
      </p>
    </section>
  );
}

export function SiteDashboard() {
  const mode = useStore((s) => s.mode);
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedSiteId);
  const missionStart = useStore((s) => s.missionStart);
  const time = useStore((s) => s.time);
  const settings = useStore((s) => s.settings);
  const horizon = useHorizon(selectedId);
  const { selectSite, setView, setTime, setAboutOpen } = useStore.getState();
  const site = sites.find((s) => s.id === selectedId);
  const { sky, analysis, status, error, sunCountdown, earthCountdown, bothCountdown } = useSiteSky(selectedId);
  const [panel, setPanel] = useState<"vertical" | "horizontal">("vertical");
  const row = useMemo(() => (analysis ? nearestRow(analysis, time) : undefined), [analysis, time]);

  if (!site) return null;
  const planner = mode === "planner";
  const start = Date.parse(missionStart);
  const end = start + WINDOW_DAYS * DAY;
  const st = analysis?.statistics;
  const disc = row?.sun_disc_fraction ?? (sky?.sun.visible ? 1 : 0);
  // Physical light on the panel depends only on how much of the disc clears the terrain.
  const w = sky ? irradiance(sky.sun.el, disc, row?.sun_distance_km, panel) : 0;
  const atLeast = (b?: boolean) => (b ? "≥ " : "");

  return (
    <aside className="dash glass" aria-label="Site information">
      <header className="dash__head">
        <div>
          <div className="eyebrow">{planner ? "Study site" : "Landing site"}</div>
          <h2>{planner ? site.name : shortName(site)}</h2>
          {planner ? (
            <div className="dash__coords mono">
              {formatLat(site.latitude_deg)} · {formatLon(site.longitude_deg)}
            </div>
          ) : (
            site.context && <div className="dash__context small">{site.context}</div>
          )}
        </div>
        <button className="btn btn--icon" onClick={() => selectSite(null)} aria-label="Close site">
          <CloseIcon />
        </button>
      </header>

      {status === "loading" && <div className="dash__loading" role="status">Calculating Sun and Earth geometry…</div>}
      {status === "error" && (
        <div className="dash__error" role="alert">
          Couldn't load this site's results. Check the connection and try another date.
          {planner && <div className="small muted">{error}</div>}
        </div>
      )}

      {sky && !planner && (
        <>
          <div className={`plain plain--sun ${sky.sun.visible ? "is-on" : ""}`}>
            <SunIcon size={22} />
            <p>
              <b>{sky.sun.visible ? "The Sun is up." : "The Sun is behind the hills."}</b>{" "}
              {sunCountdown?.kind === "set"
                ? sunCountdown.beyondRange
                  ? "It stays up for weeks."
                  : `It sets in ${roughly(sunCountdown.ms)}.`
                : sunCountdown?.kind === "rise"
                  ? `It comes back in ${roughly(sunCountdown.ms)}.`
                  : "It doesn't rise again this month."}
            </p>
          </div>
          <div className={`plain plain--earth ${sky.earth.visible ? "is-on" : ""}`}>
            <EarthIcon size={22} />
            <p>
              <b>{sky.earth.visible ? "Earth is in view." : "Earth is hidden."}</b>{" "}
              {earthCountdown?.kind === "set"
                ? earthCountdown.beyondRange
                  ? "It stays in view for weeks."
                  : `It sets in ${roughly(earthCountdown.ms)}.`
                : earthCountdown?.kind === "rise"
                  ? `It comes back in ${roughly(earthCountdown.ms)}.`
                  : "It doesn't rise again this month."}
            </p>
          </div>
          <p className="dash__summary">{summarySentence(sky.sun.visible, sky.earth.visible)}</p>
          <div className="gauge" aria-label="Sunlight for solar panels">
            <BoltIcon size={14} />
            <span>Sunlight for solar panels</span>
            <span className={`gauge__value gauge--${!sky.sun.visible ? "none" : disc < 0.99 ? "low" : "good"}`}>
              {!sky.sun.visible ? "None" : disc < 0.99 ? "Partly blocked" : "Plenty"}
            </span>
          </div>
          <div className="dash__actions">
            <button className="btn" onClick={() => setView("surface")}>
              <MountainIcon size={14} /> Stand here
            </button>
            <button className="btn" onClick={() => setView("compare")}>
              What if we land late?
            </button>
          </div>
          {site.point_note && (
            <p className="small muted">
              <InfoIcon size={12} /> We moved this point 54 m onto the crest: the published spot sits in a small hollow.{" "}
              <button className="link" onClick={() => setAboutOpen(true)}>
                Why?
              </button>
            </p>
          )}
          <p className="dash__note small muted">
            “Sunlight” means the Sun is above the hills, which lets a lander make power; it isn't a guarantee of power.{" "}
            <button className="link" onClick={() => setAboutOpen(true)}>
              How do we know?
            </button>
          </p>
        </>
      )}

      {sky && planner && (
        <>
          <div className="status-grid">
            <StatusTile kind="sun" visible={sky.sun.visible} text={sky.sun.visible ? "Sun visible" : "Sun hidden"} sub={countdownText(sunCountdown, "Sets", "Rises")} />
            <StatusTile kind="earth" visible={sky.earth.visible} text={sky.earth.visible ? "Earth in view" : "Earth hidden"} sub={countdownText(earthCountdown, "Sets", "Rises")} />
            <StatusTile kind="both" visible={sky.both} text={sky.both ? "Power + comms" : "Not both"} sub={countdownText(bothCountdown, "Ends", "Next window")} />
          </div>

          <VisibilityRules site={site} />

          <section className="card">
            <div className="card__head">
              <span>
                <BoltIcon size={14} /> Solar power potential
              </span>
              <select value={panel} onChange={(e) => setPanel(e.target.value as "vertical" | "horizontal")} aria-label="Panel orientation">
                <option value="vertical">Vertical, Sun-tracking</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </div>
            <div className="power">
              <div className="power__value mono">
                {Math.round(w).toLocaleString()} <span>W/m² now</span>
              </div>
              <div className="power__bar">
                <div style={{ width: `${Math.min(100, (w / 1420) * 100)}%` }} />
              </div>
              <div className="power__row small">
                <span>Sun disc visible</span>
                <b className="mono">{Math.round(disc * 100)}%</b>
                <span>Next 24 h</span>
                <b className="mono">{analysis ? (energyNext24h(analysis, time, panel) / 1000).toFixed(1) : "—"} kWh/m²</b>
              </div>
              <div className="muted small">Sunlight reaching 1 m² of panel before losses, scaled by Sun distance and how much of its disc clears the terrain. Not electrical output.</div>
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <span>Sky from the surface</span>
              <button className="btn btn--small" onClick={() => setView("surface")}>
                <MountainIcon size={14} /> Stand here
              </button>
            </div>
            <SkyChart horizon={horizon} analysis={analysis} sky={sky} height={160} showTracks />
            <div className="legend small">
              <span className="lg lg--terrain" />
              LOLA terrain horizon ({settings.observerHeightM} m)
              <span className="lg lg--sun" />
              Sun
              <span className="lg lg--earth" />
              Earth
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <span>Geometry at {fmtUTC(time)}</span>
            </div>
            <table className="kv">
              <thead>
                <tr>
                  <th />
                  <th>Azimuth</th>
                  <th>Elevation</th>
                  <th>Terrain</th>
                  <th>Clearance</th>
                </tr>
              </thead>
              <tbody>
                {(["sun", "earth"] as const).map((k) => {
                  const b = sky[k];
                  return (
                    <tr key={k}>
                      <th className={`kv__${k}`}>{k === "sun" ? "Sun" : "Earth"}</th>
                      <td className="mono">
                        {b.az.toFixed(1)}° <span className="muted">{cardinal(b.az)}</span>
                      </td>
                      <td className="mono">{b.el.toFixed(2)}°</td>
                      <td className="mono">{b.horizon.toFixed(2)}°</td>
                      <td className={`mono ${b.clearance > 0 ? "pos" : "neg"}`}>
                        {b.clearance > 0 ? "▲ +" : "▼ "}
                        {b.clearance.toFixed(2)}°
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="small muted">Azimuth from local north; this close to the pole, local north points almost straight at the pole's far side.</p>
          </section>

          <section className="card">
            <div className="card__head">
              <span>Height above terrain horizon</span>
            </div>
            <ClearanceChart analysis={analysis} start={start} end={end} time={time} onScrub={setTime} />
          </section>

          <section className="card">
            <div className="card__head">
              <span>{WINDOW_DAYS}-day statistics</span>
            </div>
            <table className="kv kv--stats">
              <thead>
                <tr>
                  <th />
                  <th>In view</th>
                  <th>Longest on</th>
                  <th>Longest off</th>
                </tr>
              </thead>
              <tbody>
                {(["sun", "earth", "both"] as const).map((k) => (
                  <tr key={k}>
                    <th className={`kv__${k}`}>{k === "sun" ? "Sunlight" : k === "earth" ? "Earth" : "Both"}</th>
                    <td className="mono">{st?.[k].visible_percent !== undefined ? `${st[k].visible_percent!.toFixed(1)}%` : "—"}</td>
                    <td className="mono">
                      {atLeast(st?.[k].longest_visible_clipped)}
                      {formatHours(st?.[k].longest_visible_hours)}
                    </td>
                    <td className="mono">
                      {atLeast(st?.[k].longest_not_visible_clipped)}
                      {formatHours(st?.[k].longest_not_visible_hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">“≥” means the stretch runs past the edge of the 30-day window, so it lasts at least that long.</p>
          </section>

          {st?.sun.longest_not_visible_hours !== undefined && (
            <BatteryCheck longestDarkH={st.sun.longest_not_visible_hours} atLeast={!!st.sun.longest_not_visible_clipped} />
          )}

          <section className="card">
            <div className="card__head">
              <span>
                <MountainIcon size={14} /> Terrain
              </span>
              <span className={`badge ${site.terrain_source === "lola" ? "badge--ok" : "badge--warn"}`}>{site.terrain_source === "lola" ? "LOLA 5 m" : "placeholder"}</span>
            </div>
            <dl className="facts">
              <dt>Elevation</dt>
              <dd className="mono">{site.elevation_m != null ? `${site.elevation_m.toFixed(0)} m` : "—"}</dd>
              <dt>Slope (5 m map)</dt>
              <dd className="mono">{site.slope_deg != null ? `${site.slope_deg.toFixed(1)}°` : "—"}</dd>
              <dt>Highest horizon</dt>
              <dd className="mono">{horizon ? `${Math.max(...horizon.horizon_elevations).toFixed(2)}°` : "—"}</dd>
              <dt>Observer</dt>
              <dd className="mono">{settings.observerHeightM} m above ground</dd>
              {site.context && (
                <>
                  <dt>Context</dt>
                  <dd className="small">{site.context}</dd>
                </>
              )}
              {site.point_note && (
                <>
                  <dt>Point</dt>
                  <dd className="small">{site.point_note}</dd>
                </>
              )}
              <dt>Source</dt>
              <dd className="small">{site.source}</dd>
            </dl>
            <p className="small muted">Terrain status: calculated from NASA LOLA maps, pending independent validation. Results are for one point, not the whole 100 m landing area.</p>
          </section>

          <p className="dash__note small muted">
            {site.note}. Visibility rule: {CRITERIA.find((c) => c.v === settings.sunCriterion)?.hint.toLowerCase()}; Earth clearance ≥ {settings.earthMarginDeg}°; observer {settings.observerHeightM} m above ground.
          </p>
        </>
      )}
    </aside>
  );
}
