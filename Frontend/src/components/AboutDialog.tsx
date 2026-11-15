import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { CloseIcon } from "./icons";

/** "How do we know?" Methods, validation and limits, in plain language. */
export function AboutDialog() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAboutOpen);
  const sites = useStore((s) => s.sites);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  if (!open) return null;
  const moved = sites.filter((s) => s.point_note);
  return (
    <div className="modal" role="presentation" onClick={() => setOpen(false)}>
      <div className="modal__card glass" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button ref={close} className="btn btn--icon modal__x" onClick={() => setOpen(false)} aria-label="Close">
          <CloseIcon />
        </button>
        <div className="eyebrow">How do we know?</div>
        <h2 id="about-title">Real NASA data, checked against NASA's own tools</h2>

        <section>
          <h3>Where the Sun and Earth are</h3>
          <p>
            We compute the Sun's and Earth's direction from each site with NASA/JPL's <b>SPICE</b> toolkit (DE440 planetary ephemeris, lunar
            orientation kernels, MOON_ME frame), including light-travel time and aberration, which is what you'd actually see standing there.
          </p>
          <p className="validation">
            ✓ <b>Validated against JPL Horizons</b>: for two sites and two dates, our Sun and Earth azimuth and elevation match NASA's Horizons
            system to better than <b>0.00001°</b>. These checks run automatically in our test suite.
          </p>
        </section>

        <section>
          <h3>What blocks the view</h3>
          <p>
            The horizon around each site comes from NASA's Lunar Orbiter Laser Altimeter (<b>LOLA</b>): 5 m-per-pixel maps near each site and an
            80 m map of the whole polar region (NASA Goddard PGDA). For every 1° of compass direction we trace 5 rays out to 160 km, accounting
            for the Moon's curvature, and keep the highest terrain. The Moon has no air, so there is no atmospheric bending.
          </p>
          <p>
            “Visible” means the centre of the Sun or Earth is above that terrain, seen from 2 m above the ground. In Mission planner you can
            require the whole Sun disc, a radio margin for Earth, or a 5 m / 10 m mast.
          </p>
        </section>

        {moved.length > 0 && (
          <section>
            <h3>One site point we moved</h3>
            {moved.map((s) => (
              <p key={s.id}>
                <b>{s.name}:</b> {s.point_note}
              </p>
            ))}
          </section>
        )}

        <section>
          <h3>What this tool does not model</h3>
          <ul>
            <li>Results are for a single point, not the whole ~100 m landing area. Moving even tens of metres can change them.</li>
            <li>Terrain is computed from NASA maps but not yet independently validated; peaks farther than 160 km are ignored.</li>
            <li>“Sunlight” is light reaching a panel, not guaranteed electrical power. “Earth in view” is line of sight, not a full radio link budget.</li>
            <li>No relay satellites, dust, or lander shadows.</li>
          </ul>
        </section>

        <section className="credits small muted">
          Data: NASA LRO LOLA (PGDA), LRO LROC WAC and LOLA illumination maps via NASA Moon Trek, NAIF SPICE kernels, JPL Horizons. Sites:
          Kumari et al. 2022 (Planetary Science Journal); Wueller et al. 2026 (JGR Planets). None of these are approved landing zones.
        </section>
      </div>
    </div>
  );
}
