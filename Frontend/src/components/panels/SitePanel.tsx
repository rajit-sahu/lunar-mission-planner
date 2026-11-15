import { useState } from "react";
import { useStore } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import { distanceKm, formatLat, formatLon } from "../../lib/geo";
import type { Site } from "../../api/types";
import { EarthIcon, GlobeIcon, HomeIcon, SearchIcon, SunIcon } from "../icons";

function Bar({ value, kind }: { value?: number; kind: "sun" | "earth" }) {
  return (
    <div className={`mini-bar mini-bar--${kind}`} title={value !== undefined ? `${value.toFixed(1)}% of the next 30 days` : undefined}>
      <div style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function SiteRow({ site }: { site: Site }) {
  const selected = useStore((s) => s.selectedSiteId === site.id);
  const hovered = useStore((s) => s.hoveredSiteId === site.id);
  const { selectSite, hoverSite } = useStore.getState();
  const { sky, analysis, status } = useSiteSky(site.id);
  const st = analysis?.statistics;
  return (
    <li>
      <button
        className={`site-row ${selected ? "is-selected" : ""} ${hovered ? "is-hover" : ""}`}
        onClick={() => selectSite(site.id)}
        onMouseEnter={() => hoverSite(site.id)}
        onMouseLeave={() => hoverSite(null)}
      >
        <div className="site-row__top">
          <span className="site-row__name">{site.name.split("/")[0].trim()}</span>
          {sky && (
            <span className="site-row__now">
              <SunIcon size={14} className={sky.sun.visible ? "on-sun" : "off"} />
              <EarthIcon size={14} className={sky.earth.visible ? "on-earth" : "off"} />
            </span>
          )}
        </div>
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
      </button>
    </li>
  );
}

export function SitePanel() {
  const sites = useStore((s) => s.sites);
  const [q, setQ] = useState("");
  const shown = sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <nav className="sites glass" aria-label="Candidate landing regions">
      <div className="search">
        <SearchIcon size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidate regions" aria-label="Search sites" />
      </div>
      <div className="sites__head">
        <span className="eyebrow">Candidate regions · {sites.length}</span>
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
          <SiteRow key={s.id} site={s} />
        ))}
        {shown.length === 0 && <li className="muted small">No region matches “{q}”.</li>}
      </ul>
      <div className="sites__foot small muted">Bars: share of the 30 days after landing with the Sun / Earth above the terrain.</div>
    </nav>
  );
}
