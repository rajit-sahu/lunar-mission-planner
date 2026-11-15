import { lazy, Suspense, useEffect, useState } from "react";
import { useStore } from "./state/store";
import { useClock } from "./state/hooks";
import { MoonGlobe } from "./components/globe/MoonGlobe";
import { TopBar } from "./components/panels/TopBar";
import { SitePanel } from "./components/panels/SitePanel";
import { SiteDashboard } from "./components/panels/SiteDashboard";
import { TimelineDock } from "./components/panels/TimelineDock";
import { LayerSwitcher } from "./components/panels/LayerSwitcher";
import { AboutDialog } from "./components/AboutDialog";
import { StoryTour } from "./components/StoryTour";
import { CloseIcon, PlayIcon } from "./components/icons";

// Views not needed on first paint load on demand.
const SurfacePOV = lazy(() => import("./components/pov/SurfacePOV").then((m) => ({ default: m.SurfacePOV })));
const CompareView = lazy(() => import("./components/compare/CompareView").then((m) => ({ default: m.CompareView })));
const LateView = lazy(() => import("./components/compare/LateView").then((m) => ({ default: m.LateView })));

function Welcome() {
  const selected = useStore((s) => s.selectedSiteId);
  const story = useStore((s) => s.storyStep);
  const [dismissed, setDismissed] = useState(false);
  if (selected || dismissed || story !== null) return null;
  return (
    <div className="welcome glass">
      <button className="btn btn--icon welcome__x" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <CloseIcon size={14} />
      </button>
      <div className="eyebrow">Moon’s south pole</div>
      <h3>Here the Sun never climbs high.</h3>
      <p>
        At the lunar south pole the Sun circles just above the horizon. A ridge a few metres high can decide between solar power and darkness, and
        Earth bobs in and out of view as the Moon wobbles.
      </p>
      <div className="welcome__actions">
        <button className="btn btn--primary" onClick={() => useStore.getState().setStoryStep(0)}>
          <PlayIcon size={13} /> Show me (1 minute)
        </button>
        <span className="muted small">or pick a site</span>
      </div>
    </div>
  );
}

function LoadingVeil() {
  const ready = useStore((s) => s.sites.length > 0 && Object.values(s.analyses).some((a) => a.status !== "loading"));
  if (ready) return null;
  return (
    <div className="veil" role="status" aria-live="polite">
      <div className="veil__spinner" aria-hidden />
      Loading NASA LOLA terrain and SPICE results…
    </div>
  );
}

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  const role = t.getAttribute?.("role");
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || role === "slider" || role === "switch" || t.isContentEditable;
};

export default function App() {
  const view = useStore((s) => s.view);
  const mode = useStore((s) => s.mode);
  const selected = useStore((s) => s.selectedSiteId);
  useClock();

  useEffect(() => {
    useStore.getState().init();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === "Escape") {
        if (s.aboutOpen) s.setAboutOpen(false);
        else if (s.storyStep !== null) s.setStoryStep(null);
        else if (s.view !== "globe") s.setView("globe");
        else s.selectSite(null, false);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === "[" || e.key === "]") {
        s.setTime(s.time + (e.key === "]" ? 1 : -1) * 3_600_000 * 6);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app view-${view} layer-${mode}`}>
      <MoonGlobe />
      <TopBar />
      {view === "globe" && (
        <>
          <SitePanel />
          {mode === "planner" && <LayerSwitcher />}
          {selected ? <SiteDashboard /> : <Welcome />}
        </>
      )}
      <Suspense fallback={<div className="veil">Loading…</div>}>
        {view === "surface" && <SurfacePOV />}
        {view === "compare" && (mode === "planner" ? <CompareView /> : <LateView />)}
      </Suspense>
      {view !== "compare" && <TimelineDock />}
      <StoryTour />
      <AboutDialog />
      <LoadingVeil />
    </div>
  );
}
