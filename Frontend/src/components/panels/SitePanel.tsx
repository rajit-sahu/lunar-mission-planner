import { useMemo, useState } from "react";
import { analysisKey, useStore, WINDOW_DAYS } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { distanceKm, formatLat, formatLon } from "../../lib/geo";
import type { Site } from "../../api/types";
import { EarthIcon, GlobeIcon, HomeIcon, SearchIcon, SunIcon } from "../icons";
import { shortName } from "../globe/GlobeOverlay";

function Bar({ value, kind }: { value?: number; kind: "sun" | "earth" }) {
  return (
    <div className={`mini-bar mini-bar--${kind}`} title={value !== undefined ? `${value.toFixed(1)}% of the next 30 days` : undefined}>
      <div style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

/** One-word strengths, comparing the sites over the current window. */
function useTraits(): Record<string, string[]> {
  const sites = useStore((s) => s.sites);
  const analyses = useStore((s) => s.analyses);
  const missionStart = useStore((s) => s.missionStart);
  const settings = useStore((s) => s.settings);
  return useMemo(() => {
    const stats = sites.map((site) => ({ id: site.id, st: analyses[analysisKey(site.id, missionStart, settings)]?.data?.statistics }));
    const out: Record<string, string[]> = {};
    if (!stats.length || stats.some((x) => !x.st)) return out;
    const top = (k: "sun" | "earth" | "both", label: string) => {
      const best = stats.reduce((a, b) => ((b.st![k].visible_percent ?? 0) > (a.st![k].visible_percent ?? 0) ? b : a));
      if ((best.st![k].visible_percent ?? 0) > 0) (out[best.id] ??= []).push(label);
    };
    top("sun", "Sunniest");
    top("earth", "Best Earth view");
    top("both", "Power + radio most often");
    return out;
  }, [sites, analyses, missionStart, settings]);
}

function SiteRow({ site, traits }: { site: Site; traits: string[] }) {
  const selected = useStore((s) => s.selectedSiteId === site.id);
  const hovered = useStore((s) => s.hoveredSiteId === site.id);
  const planner = useStore((s) => s.mode === "planner");
  const { selectSite, hoverSite } = useStore.getState();
  const { sky, analysis, status } = useSiteSky(site.id);
  const st = analysis?.statistics;
  const days = (p?: number) => (p === undefined ? "…" : Math.round((p / 100) * WINDOW_DAYS));
  return (
    <li>
      <button
        className={`site-row ${selected ? "is-selected" : ""} ${hovered ? "is-hover" : ""}`}
        onClick={() => selectSite(site.id)}
        onMouseEnter={() => hoverSite(site.id)}
        onMouseLeave={() => hoverSite(null)}
        aria-current={selected || undefined}
      >
        <div className="site-row__top">
          <span className="site-row__name">{shortName(site)}</span>
          {sky && (
            <span className="site-row__now" aria-label={`Now: Sun ${sky.sun.visible ? "up" : "down"}, Earth ${sky.earth.visible ? "in view" : "hidden"}`}>
              <SunIcon size={14} className={sky.sun.visible ? "on-sun" : "off"} />
              <EarthIcon size={14} className={sky.earth.visible ? "on-earth" : "off"} />
            </span>
          )}
        </div>
        {planner ? (
          <>
            <div className="site-row__sub mono">
              {formatLat(site.latitude_deg)} {formatLon(site.longitude_deg)} · {distanceKm(-90, 0, site.latitude_deg, site.longitude_deg).toFixed(0)} km from pole
            </div>
            <div className="site-row__bars">
              <span className="small muted">Sun</span>
              <Bar value={st?.sun.visible_percent} kind="sun" />
              <span className="small mono">{st?.sun.visible_percent !== undefined ? `${Math.round(st.sun.visible_percent)}%` : status === "loading" ? "…" : "—"}</span>
              <span className="small muted">Earth</span>
              <Bar value={st?.earth.visible_percent} kind="earth" />
              <span className="small mono">{st?.earth.visible_percent !== undefined ? `${Math.round(st.earth.visible_percent)}%` : status === "loading" ? "…" : "—"}</span>
            </div>
          </>
        ) : (
          <>
            {traits.length > 0 && (
              <div className="site-row__traits">
                {traits.map((t) => (
                  <span key={t} className="trait">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="site-row__plain small">
              Sunlight about {days(st?.sun.visible_percent)} of {WINDOW_DAYS} days · Earth in view about {days(st?.earth.visible_percent)} days
            </div>
          </>
        )}
      </button>
    </li>
  );
}

export function SitePanel() {
  const sites = useStore((s) => s.sites);
  const planner = useStore((s) => s.mode === "planner");
  const traits = useTraits();
  const [q, setQ] = useState("");
  const shown = sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <nav className="sites glass" aria-label="Landing sites">
      {planner && (
        <div className="search">
          <SearchIcon size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites" aria-label="Search sites" />
        </div>
      )}
      <div className="sites__head">
        <span className="eyebrow">{planner ? `Study sites · ${sites.length}` : "Pick a spot"}</span>
        <span className="sites__views">
          <button className="btn btn--icon" title="South pole view" aria-label="South pole view" onClick={() => window.dispatchEvent(new Event("globe:home"))}>
            <HomeIcon size={16} />
          </button>
          <button className="btn btn--icon" title="Whole Moon" aria-label="Whole Moon" onClick={() => window.dispatchEvent(new Event("globe:full"))}>
            <GlobeIcon size={16} />
          </button>
        </span>
      </div>
      <ul className="sites__list">
        {shown.map((s) => (
          <SiteRow key={s.id} site={s} traits={traits[s.id] ?? []} />
        ))}
        {shown.length === 0 && <li className="muted small">No site matches “{q}”.</li>}
      </ul>
      <div className="sites__foot small muted">
        {planner
          ? "Bars: share of the 30 days after landing with the Sun / Earth above the terrain, under the current visibility rules."
          : "Counted over the 30 days after landing."}
      </div>
    </nav>
  );
}
