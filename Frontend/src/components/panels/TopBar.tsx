import { useStore, type View } from "../../state/store";
import type { DataOrigin } from "../../api/types";
import { CompareIcon, GlobeIcon, MountainIcon } from "../icons";

const ORIGIN_LABEL: Record<DataOrigin, { text: string; title: string; cls: string }> = {
  live: { text: "Live · SPICE + LOLA", title: "Computed now by the FastAPI science backend", cls: "ok" },
  snapshot: { text: "Saved results · SPICE + LOLA", title: "Precomputed backend output bundled with the app", cls: "ok" },
  demo: { text: "Demo data (approximate)", title: "Backend unreachable: showing an approximate analytic model, not mission-grade results", cls: "warn" },
};

const VIEWS: { v: View; label: string; Icon: typeof GlobeIcon }[] = [
  { v: "globe", label: "Map", Icon: GlobeIcon },
  { v: "surface", label: "Surface", Icon: MountainIcon },
  { v: "compare", label: "Compare", Icon: CompareIcon },
];

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const view = useStore((s) => s.view);
  const selected = useStore((s) => s.selectedSiteId);
  const origin = useStore((s) => {
    const a = Object.values(s.analyses).find((x) => x.origin);
    return a?.origin ?? s.sitesOrigin;
  });
  const { setMode, setView, selectSite, sites } = useStore.getState();
  const o = origin ? ORIGIN_LABEL[origin] : null;

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
          <div className="brand__sub">Sun &amp; Earth visibility for landing-site decisions</div>
        </div>
      </div>

      <div className="topbar__center glass">
        <div className="seg seg--lg" role="tablist" aria-label="View">
          {VIEWS.map(({ v, label, Icon }) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "seg__btn active" : "seg__btn"}
              onClick={() => {
                if (v === "surface" && !selected) selectSite(useStore.getState().sites[0]?.id ?? sites[0]?.id ?? null, false);
                setView(v);
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar__right">
        {o && (
          <span className={`origin origin--${o.cls}`} title={o.title}>
            <span className="origin__dot" /> {o.text}
          </span>
        )}
        <div className="seg glass" role="group" aria-label="Detail level">
          <button className={mode === "explore" ? "seg__btn active" : "seg__btn"} onClick={() => setMode("explore")} title="Simple indicators for everyone">
            Explore
          </button>
          <button className={mode === "analyse" ? "seg__btn active" : "seg__btn"} onClick={() => setMode("analyse")} title="Engineering detail: angles, margins, statistics">
            Analyse
          </button>
        </div>
      </div>
    </header>
  );
}
