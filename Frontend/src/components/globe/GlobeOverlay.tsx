import { useEffect, useRef } from "react";
import { useStore } from "../../state/store";
import { useSiteSky } from "../../state/hooks";
import type { Site } from "../../api/types";
import { SunIcon, EarthIcon } from "../icons";

/** Imperative handles the 3D scene writes to every frame (no React re-render). */
export const overlayRefs: {
  pins: Map<string, HTMLElement>;
  arrows: HTMLElement | null;
  setArrow?: (k: "sun" | "earth" | "north", angleDeg: number, visible: boolean) => void;
  setScale?: (mPerPx: number, altM: number) => void;
} = { pins: new Map(), arrows: null };

export function shortName(site: Site) {
  return site.name.split("/")[0].trim();
}

function Pin({ site }: { site: Site }) {
  const selected = useStore((s) => s.selectedSiteId === site.id);
  const hovered = useStore((s) => s.hoveredSiteId === site.id);
  const select = useStore((s) => s.selectSite);
  const hover = useStore((s) => s.hoverSite);
  const { sky } = useSiteSky(site.id);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    overlayRefs.pins.set(site.id, el);
    return () => {
      overlayRefs.pins.delete(site.id);
    };
  }, [site.id]);

  const cls = ["pin", selected && "pin--selected", hovered && "pin--hover", sky?.sun.visible && "pin--sun", sky?.earth.visible && "pin--earth"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      className={cls}
      onClick={() => select(site.id)}
      onMouseEnter={() => hover(site.id)}
      onMouseLeave={() => hover(null)}
      aria-label={`Select ${site.name}`}
      style={{ opacity: 0 }}
    >
      <span className="pin__dot" />
      <span className="pin__label">
        <span className="pin__name">{shortName(site)}</span>
        {sky && (
          <span className="pin__status">
            <SunIcon size={12} className={sky.sun.visible ? "on-sun" : "off"} />
            <EarthIcon size={12} className={sky.earth.visible ? "on-earth" : "off"} />
          </span>
        )}
      </span>
    </button>
  );
}

function Arrows() {
  const ref = useRef<HTMLDivElement>(null);
  const sun = useRef<SVGGElement>(null);
  const earth = useRef<SVGGElement>(null);
  const north = useRef<SVGGElement>(null);
  useEffect(() => {
    overlayRefs.arrows = ref.current;
    overlayRefs.setArrow = (k, angle, visible) => {
      const g = k === "sun" ? sun.current : k === "earth" ? earth.current : north.current;
      if (!g) return;
      g.setAttribute("transform", `rotate(${angle.toFixed(2)})`);
      g.classList.toggle("blocked", !visible);
    };
    return () => {
      overlayRefs.arrows = null;
      overlayRefs.setArrow = undefined;
    };
  }, []);
  return (
    <div ref={ref} className="bearing" style={{ opacity: 0 }} aria-hidden>
      <svg width="320" height="320" viewBox="-160 -160 320 320">
        <circle r="118" className="bearing__ring" />
        <g ref={north} className="bearing__north">
          <line x1="118" x2="132" y1="0" y2="0" />
          <text x="142" y="4" transform="rotate(90 142 0)">N</text>
        </g>
        <g ref={earth} className="bearing__earth">
          <line x1="14" x2="112" y1="0" y2="0" />
          <path d="M112,-7 L126,0 L112,7 Z" />
          <circle cx="140" cy="0" r="9" />
        </g>
        <g ref={sun} className="bearing__sun">
          <line x1="14" x2="112" y1="0" y2="0" />
          <path d="M112,-7 L126,0 L112,7 Z" />
          <circle cx="140" cy="0" r="8" />
        </g>
      </svg>
    </div>
  );
}

const NICE = [1, 2, 5];
function niceLength(maxM: number) {
  const p = 10 ** Math.floor(Math.log10(maxM));
  let best = p;
  for (const n of NICE) if (n * p <= maxM) best = n * p;
  return best;
}

function ScaleBar() {
  const bar = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const alt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    overlayRefs.setScale = (mPerPx, altM) => {
      const len = niceLength(mPerPx * 120);
      if (bar.current) bar.current.style.width = `${len / mPerPx}px`;
      if (label.current) label.current.textContent = len >= 1000 ? `${len / 1000} km` : `${len} m`;
      if (alt.current) alt.current.textContent = altM >= 1e5 ? `${Math.round(altM / 1000).toLocaleString()} km` : `${(altM / 1000).toFixed(1)} km`;
    };
    return () => {
      overlayRefs.setScale = undefined;
    };
  }, []);
  return (
    <div className="scalebar">
      <div className="scalebar__row">
        <div ref={bar} className="scalebar__bar" />
        <span ref={label} />
      </div>
      <div className="scalebar__alt">
        Altitude <span ref={alt} />
      </div>
    </div>
  );
}

export function GlobeOverlay() {
  const sites = useStore((s) => s.sites);
  return (
    <div className="globe-overlay">
      <Arrows />
      {sites.map((s) => (
        <Pin key={s.id} site={s} />
      ))}
      <ScaleBar />
    </div>
  );
}
