import { analysisKey, useStore, type View } from "../../state/store";
import type { DataOrigin } from "../../api/types";
import { CompareIcon, GlobeIcon, InfoIcon, MountainIcon, PlayIcon } from "../icons";

const ORIGIN_LABEL: Record<DataOrigin, { text: string; title: string; cls: string }> = {
  live: { text: "Live · SPICE + LOLA", title: "Computed now by the FastAPI science backend", cls: "ok" },
  snapshot: { text: "Precomputed · SPICE + LOLA", title: "Backend output precomputed for these dates; other dates are calculated live", cls: "ok" },
  demo: { text: "Demo data (approximate)", title: "Backend unreachable: showing an approximate analytic model, not mission-grade results", cls: "warn" },
};

const VIEWS: { v: View; discover: string; planner: string; Icon: typeof GlobeIcon }[] = [
  { v: "globe", discover: "Map", planner: "Map", Icon: GlobeIcon },
  { v: "surface", discover: "Stand here", planner: "Surface", Icon: MountainIcon },
  { v: "compare", discover: "Land late?", planner: "Compare", Icon: CompareIcon },
];

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const view = useStore((s) => s.view);
  const selected = useStore((s) => s.selectedSiteId);
  // Demo data anywhere → warn; otherwise say "live" if the current date was computed live.
  const origin = useStore((s) => {
    const all = Object.values(s.analyses);
    if (all.some((x) => x.origin === "demo")) return "demo" as const;
    const current = s.sites.map((site) => s.analyses[analysisKey(site.id, s.missionStart, s.settings)]?.origin).find(Boolean);
    return current ?? s.sitesOrigin;
  });
  const { setMode, setView, selectSite, setStoryStep, setAboutOpen } = useStore.getState();
  const o = origin ? ORIGIN_LABEL[origin] : null;
  const planner = mode === "planner";

  return (
    <header className="topbar">
      <div className="brand glass">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="13" fill="#d8dbe2" />
          <path d="M16 3a13 13 0 0 1 0 26a9 13 0 0 0 0-26z" fill="#0b0e15" opacity=".85" />
          <circle cx="16" cy="27" r="2.4" fill="#ffb547" />
        </svg>
        <div>
          <div className="brand__name">Lunar South Pole Mission Planner</div>
          <div className="brand__sub">{planner ? "Sun & Earth visibility for landing-site decisions" : "Where can a lander get sunlight and call home?"}</div>
        </div>
      </div>

      <nav className="topbar__center glass" aria-label="Views">
        <div className="seg seg--lg">
          {VIEWS.map(({ v, discover, planner: p, Icon }) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={view === v ? "seg__btn active" : "seg__btn"}
              onClick={() => {
                if (v === "surface" && !selected) selectSite(useStore.getState().sites[0]?.id ?? null, false);
                setView(v);
              }}
            >
              <Icon size={15} /> {planner ? p : discover}
            </button>
          ))}
        </div>
      </nav>

      <div className="topbar__right">
        {!planner && (
          <button className="btn btn--pill glass" onClick={() => setStoryStep(0)}>
            <PlayIcon size={13} /> Show me
          </button>
        )}
        {planner && o && (
          <span className={`origin origin--${o.cls}`} title={o.title}>
            <span className="origin__dot" /> {o.text}
          </span>
        )}
        {!planner && o?.cls === "warn" && (
          <span className="origin origin--warn" title={o.title}>
            <span className="origin__dot" /> Approximate data
          </span>
        )}
        <button className="btn btn--icon glass about-btn" onClick={() => setAboutOpen(true)} aria-label="How do we know? Data and methods" title="How do we know?">
          <InfoIcon size={17} />
        </button>
        <button
          className={`layer-switch glass ${planner ? "is-on" : ""}`}
          role="switch"
          aria-checked={planner}
          onClick={() => setMode(planner ? "discover" : "planner")}
          title={planner ? "Back to the simple view" : "Show angles, margins, statistics and constraints"}
        >
          <span className="layer-switch__track" aria-hidden>
            <span className="layer-switch__thumb" />
          </span>
          Mission planner
        </button>
      </div>
    </header>
  );
}
