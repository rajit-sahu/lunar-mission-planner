import { useRef, useState } from "react";
import { useStore } from "../../state/store";
import { overlayRefs } from "./GlobeOverlay";

const SNAP_PX = 90;

function AstronautIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 30 39" aria-hidden>
      <circle cx="15" cy="9" r="8" fill="#e8ecf4" />
      <rect x="9.5" y="5.5" width="11" height="6.5" rx="3.2" fill="#1b2433" />
      <path d="M11 7.4 q4 -1.6 7 0" stroke="#7cc4ff" strokeWidth="1.2" fill="none" opacity=".8" />
      <rect x="7" y="16.5" width="16" height="13" rx="4" fill="#e8ecf4" />
      <rect x="11" y="19.5" width="8" height="4" rx="1" fill="#ffb547" />
      <rect x="3.5" y="17.5" width="4" height="10" rx="2" fill="#d2d8e3" />
      <rect x="22.5" y="17.5" width="4" height="10" rx="2" fill="#d2d8e3" />
      <rect x="9" y="28.5" width="5" height="9" rx="2" fill="#d2d8e3" />
      <rect x="16" y="28.5" width="5" height="9" rx="2" fill="#d2d8e3" />
    </svg>
  );
}

/** Nearest visible site marker to a screen point, if within snapping distance. */
function nearestPin(x: number, y: number) {
  let best: string | null = null;
  let bestD = SNAP_PX;
  overlayRefs.pins.forEach((el, id) => {
    if (el.style.opacity === "0") return;
    const dot = el.querySelector(".pin__dot") as HTMLElement | null;
    const r = (dot ?? el).getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (d < bestD) {
      best = id;
      bestD = d;
    }
  });
  return best as string | null;
}

/**
 * Street-View-style "drop the astronaut": drag onto a site marker to stand
 * there; a plain click stands you at the selected (or first) site.
 */
export function Astronaut() {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const standAt = (id: string | null) => {
    const s = useStore.getState();
    const site = id ?? s.selectedSiteId ?? s.sites[0]?.id ?? null;
    if (!site) return;
    s.selectSite(site, false);
    s.setSvPoint("landing");
    s.setView("surface");
  };

  const clearHighlight = () => overlayRefs.pins.forEach((el) => el.classList.remove("pin--drop"));

  return (
    <>
      <button
        className={`astronaut glass ${drag ? "is-lifted" : ""}`}
        aria-label="Stand on the Moon: drag the astronaut onto a site, or press to stand at the selected site"
        title="Drag onto a site to stand there"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          if (!drag && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < 6) return;
          document.body.classList.add("astronaut-dragging");
          setDrag({ x: e.clientX, y: e.clientY });
          const near = nearestPin(e.clientX, e.clientY);
          if (near !== target) {
            clearHighlight();
            if (near) overlayRefs.pins.get(near)?.classList.add("pin--drop");
            setTarget(near);
          }
        }}
        onPointerUp={() => {
          const wasDrag = !!drag;
          const near = target;
          start.current = null;
          setDrag(null);
          setTarget(null);
          clearHighlight();
          document.body.classList.remove("astronaut-dragging");
          if (!wasDrag) standAt(null);
          else if (near) standAt(near);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            standAt(null);
          }
        }}
      >
        <AstronautIcon />
      </button>
      {drag && (
        <div className={`astronaut-ghost ${target ? "will-drop" : ""}`} style={{ left: drag.x, top: drag.y }} aria-hidden>
          <AstronautIcon size={34} />
          <span>{target ? "Drop to stand here" : "Drag onto a site"}</span>
        </div>
      )}
    </>
  );
}
