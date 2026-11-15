import { useState } from "react";
import { DAY, useStore, WINDOW_DAYS } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { cardinal, formatLat, formatLon } from "../../lib/geo";
import { formatDuration, formatHours, fmtUTC, type Countdown } from "../../lib/timeline";
import { irradiance, PANEL_LABEL, type PanelKind } from "../../lib/power";
import { SkyChart } from "../charts/SkyChart";
import { ClearanceChart } from "../charts/ClearanceChart";
import { BoltIcon, CloseIcon, EarthIcon, MountainIcon, SunIcon } from "../icons";

function countdownText(c: Countdown | undefined, setWord: string, riseWord: string) {
  if (!c) return "";
  if (c.kind === "set") return c.beyondRange ? `${setWord} in more than ${formatDuration(c.ms, true)}` : `${setWord} in ${formatDuration(c.ms)}`;
  if (c.kind === "rise") return `${riseWord} in ${formatDuration(c.ms)}`;
  return `No ${riseWord.toLowerCase()} in the next ${formatDuration(c.ms, true)}`;
}

function StatusTile({ kind, visible, text, sub }: { kind: "sun" | "earth" | "both"; visible: boolean; text: string; sub: string }) {
  const Icon = kind === "earth" ? EarthIcon : SunIcon;
  return (
    <div className={`status status--${kind} ${visible ? "is-on" : "is-off"}`}>
      <div className="status__icon">{kind === "both" ? <><SunIcon size={15} /><EarthIcon size={15} /></> : <Icon size={22} />}</div>
      <div className="status__body">
        <div className="status__title">{text}</div>
        <div className="status__sub">{sub}</div>
      </div>
    </div>
  );
}

function summarySentence(sun: boolean, earth: boolean) {
  if (sun && earth) return "A lander here right now would have sunlight for power and a direct radio line to Earth.";
  if (sun) return "Sunlight for power, but Earth is below the terrain horizon, so there is no direct radio link without a relay satellite.";
  if (earth) return "Earth is in view for communication, but the Sun is hidden behind terrain, so the lander is on batteries and cooling down.";
  return "Neither the Sun nor Earth is visible: no solar power and no direct communication. Survival mode.";
}

export function SiteDashboard() {
  const mode = useStore((s) => s.mode);
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedSiteId);
  const missionStart = useStore((s) => s.missionStart);
  const time = useStore((s) => s.time);
  const horizon = useStore((s) => (selectedId ? s.horizons[selectedId] : undefined));
  const { selectSite, setView, setTime } = useStore.getState();
  const site = sites.find((s) => s.id === selectedId);
  const { sky, analysis, status, error, sunCountdown, earthCountdown, bothCountdown } = useSiteSky(selectedId);
  const [panel, setPanel] = useState<PanelKind>("vertical-tracking");

  if (!site) return null;
  const start = Date.parse(missionStart);
  const end = start + WINDOW_DAYS * DAY;
  const st = analysis?.statistics;
  const w = irradiance(sky?.sun.el ?? 0, !!sky?.sun.visible, panel);

  return (
    <aside className="dash glass" aria-label="Site information">
      <header className="dash__head">
        <div>
          <div className="eyebrow">Candidate region</div>
          <h2>{site.name}</h2>
          <div className="dash__coords mono">
            {formatLat(site.latitude_deg)} · {formatLon(site.longitude_deg)}
          </div>
        </div>
        <button className="btn btn--icon" onClick={() => selectSite(null)} aria-label="Close site">
          <CloseIcon />
        </button>
      </header>

      {status === "loading" && <div className="dash__loading">Calculating Sun and Earth geometry…</div>}
      {status === "error" && <div className="dash__error">Could not load analysis: {error}</div>}

      {sky && (
        <>
          <div className="status-grid">
            <StatusTile
              kind="sun"
              visible={sky.sun.visible}
              text={sky.sun.visible ? "Sun visible" : "Sun hidden"}
              sub={countdownText(sunCountdown, "Sets", "Rises")}
            />
            <StatusTile
              kind="earth"
              visible={sky.earth.visible}
              text={sky.earth.visible ? "Earth in view" : "Earth hidden"}
              sub={countdownText(earthCountdown, "Sets", "Rises")}
            />
            <StatusTile
              kind="both"
              visible={sky.both}
              text={sky.both ? "Power + comms" : "Not both"}
              sub={countdownText(bothCountdown, "Ends", "Next window")}
            />
          </div>
          {mode === "explore" && <p className="dash__summary">{summarySentence(sky.sun.visible, sky.earth.visible)}</p>}

          <section className="card">
            <div className="card__head">
              <span>
                <BoltIcon size={14} /> Solar power potential
              </span>
              <select value={panel} onChange={(e) => setPanel(e.target.value as PanelKind)} aria-label="Panel orientation">
                <option value="vertical-tracking">Vertical, Sun-tracking</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </div>
            <div className="power">
              <div className="power__value mono">
                {Math.round(w).toLocaleString()} <span>W/m²</span>
              </div>
              <div className="power__bar">
                <div style={{ width: `${(w / 1361) * 100}%` }} />
              </div>
              <div className="muted small">
                {PANEL_LABEL[panel]}. Sunlight reaching the panel, before losses: potential illumination, not guaranteed power.
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <span>Sky from the surface</span>
              <button className="btn btn--small" onClick={() => setView("surface")}>
                <MountainIcon size={14} /> Stand here
              </button>
            </div>
            <SkyChart horizon={horizon} analysis={analysis} sky={sky} height={mode === "analyse" ? 160 : 120} showTracks={mode === "analyse"} />
            <div className="legend small">
              <span className="lg lg--terrain" />
              LOLA terrain horizon
              <span className="lg lg--sun" />
              Sun
              <span className="lg lg--earth" />
              Earth
            </div>
          </section>

          {mode === "analyse" && (
            <>
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
                            {b.clearance > 0 ? "+" : ""}
                            {b.clearance.toFixed(2)}°
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                        <td className="mono">{formatHours(st?.[k].longest_visible_hours)}</td>
                        <td className="mono">{formatHours(st?.[k].longest_not_visible_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="card">
                <div className="card__head">
                  <span>
                    <MountainIcon size={14} /> Terrain
                  </span>
                  <span className={`badge ${site.terrain_source === "lola" ? "badge--ok" : "badge--warn"}`}>
                    {site.terrain_source === "lola" ? "LOLA" : "placeholder"}
                  </span>
                </div>
                <dl className="facts">
                  <dt>Elevation</dt>
                  <dd className="mono">{site.elevation_m != null ? `${site.elevation_m.toFixed(0)} m` : "—"}</dd>
                  <dt>Slope</dt>
                  <dd className="mono">{site.slope_deg != null ? `${site.slope_deg.toFixed(1)}°` : "—"}</dd>
                  <dt>Highest horizon</dt>
                  <dd className="mono">{horizon ? `${Math.max(...horizon.horizon_elevations).toFixed(2)}°` : "—"}</dd>
                  <dt>Source</dt>
                  <dd className="small">{site.source}</dd>
                </dl>
              </section>
            </>
          )}

          <p className="dash__note small muted">
            {site.note}. Visibility means the centre of the Sun/Earth is above the LOLA terrain horizon (geometric line of sight), from 2 m above the surface.
          </p>
        </>
      )}
    </aside>
  );
}
