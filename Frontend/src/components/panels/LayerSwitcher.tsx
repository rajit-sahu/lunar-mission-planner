import { useState } from "react";
import { useStore, type MapLayer } from "../../state/store";
import { LayersIcon } from "../icons";

export const LAYERS: { id: MapLayer; name: string; desc: string; source: string; thumb: string; ramp?: [string, string] }[] = [
  {
    id: "shade",
    name: "Terrain",
    desc: "LOLA hillshade, 30 m/px (5 m/px within 40 km of the pole)",
    source: "LRO LOLA via NASA Moon Trek",
    thumb: "/textures/sp_outer_shade.jpg",
  },
  {
    id: "wac",
    name: "Imagery",
    desc: "LROC Wide Angle Camera mosaic",
    source: "LRO LROC WAC via NASA Moon Trek",
    thumb: "/textures/sp_outer_wac.jpg",
  },
  {
    id: "illum",
    name: "Avg. sunlight",
    desc: "Average fraction of time in sunlight (LOLA model, ~1 km/px)",
    source: "LRO LOLA illumination (Mazarico et al.) via Moon Trek",
    thumb: "/textures/sp_outer_illum.jpg",
    ramp: ["never lit", "always lit"],
  },
  {
    id: "earthvis",
    name: "Avg. Earth view",
    desc: "Average fraction of time Earth is visible (LOLA model, 120 m/px)",
    source: "LRO LOLA Earth visibility (Mazarico et al.) via Moon Trek",
    thumb: "/textures/sp_outer_earthvis.jpg",
    ramp: ["never", "always"],
  },
];

export function LayerSwitcher() {
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const [open, setOpen] = useState(false);
  const active = LAYERS.find((l) => l.id === layer)!;
  return (
    <div className="layers">
      {open && (
        <div className="layers__pop glass" role="dialog" aria-label="Map layers">
          {LAYERS.map((l) => (
            <button key={l.id} className={`layer ${l.id === layer ? "is-active" : ""}`} onClick={() => setLayer(l.id)}>
              <span className={`layer__thumb ${l.ramp ? "layer__thumb--ramp" : ""}`} style={{ backgroundImage: `url(${l.thumb})` }} />
              <span className="layer__text">
                <span className="layer__name">{l.name}</span>
                <span className="layer__desc">{l.desc}</span>
              </span>
            </button>
          ))}
          <div className="small muted layers__src">Source: {active.source}</div>
        </div>
      )}
      <button className="layers__btn glass" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`layer__thumb ${active.ramp ? "layer__thumb--ramp" : ""}`} style={{ backgroundImage: `url(${active.thumb})` }} />
        <span>
          <LayersIcon size={14} /> {active.name}
        </span>
      </button>
      {active.ramp && (
        <div className="ramp glass">
          <div className="ramp__bar" />
          <div className="ramp__labels small">
            <span>{active.ramp[0]}</span>
            <span>{active.ramp[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
