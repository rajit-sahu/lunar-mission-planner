import { useEffect, useState } from "react";
import { useStore } from "./state/store";
import { useClock } from "./state/hooks";
import { MoonGlobe } from "./components/globe/MoonGlobe";
import { TopBar } from "./components/panels/TopBar";
import { SitePanel } from "./components/panels/SitePanel";
import { SiteDashboard } from "./components/panels/SiteDashboard";
import { TimelineDock } from "./components/panels/TimelineDock";
import { LayerSwitcher } from "./components/panels/LayerSwitcher";
import { SurfacePOV } from "./components/pov/SurfacePOV";
import { CompareView } from "./components/compare/CompareView";
import { CloseIcon } from "./components/icons";

function Welcome() {
  const selected = useStore((s) => s.selectedSiteId);
  const [dismissed, setDismissed] = useState(false);
  if (selected || dismissed) return null;
  return (
    <div className="welcome glass">
      <button className="btn btn--icon welcome__x" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <CloseIcon size={14} />
      </button>
      <div className="eyebrow">Moon’s south pole</div>
      <h3>Here the Sun never climbs high.</h3>
      <p>
        At the lunar south pole the Sun circles just above the horizon, so a ridge a few hundred metres high can mean the difference between solar power and darkness, and Earth
        bobs in and out of view as the Moon wobbles.
      </p>
      <p className="muted">Pick a candidate region to see when it has sunlight and a direct line to Earth. Press play to watch a lunar day go by.</p>
    </div>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const selected = useStore((s) => s.selectedSiteId);
  useClock();

  useEffect(() => {
    useStore.getState().init();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const s = useStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === "Escape") {
        if (s.view !== "globe") s.setView("globe");
        else s.selectSite(null, false);
      } else if (e.key === "[" || e.key === "]") {
        s.setTime(s.time + (e.key === "]" ? 1 : -1) * 3_600_000 * 6);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app view-${view}`}>
      <MoonGlobe />
      <TopBar />
      {view === "globe" && (
        <>
          <SitePanel />
          <LayerSwitcher />
          {selected ? <SiteDashboard /> : <Welcome />}
        </>
      )}
      {view === "surface" && <SurfacePOV />}
      {view === "compare" && <CompareView />}
      {view !== "compare" && <TimelineDock />}
    </div>
  );
}
