import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { CloseIcon } from "./icons";

/** "How do we know?" Methods, validation and limits, in plain language. */
export function AboutDialog() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAboutOpen);
  const setStory = useStore((s) => s.setStoryStep);
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
        <h2 id="about-title">Real NASA data, and how far to trust it</h2>
        <p>
          <button className="btn" onClick={() => { setOpen(false); setStory(0); }}>
            Take the 1-minute tour
          </button>
        </p>

        <section>
          <h3>Where the Sun and Earth are</h3>
          <p>
            We compute the Sun's and Earth's direction from each site with NASA/JPL's <b>SPICE</b> toolkit (DE440 planetary ephemeris, lunar
            orientation kernels, MOON_ME frame), including light-travel time and aberration, which is what you'd actually see standing there.
          </p>
          <p className="validation">
            ✓ <b>Validated against JPL Horizons</b>: for two sites and two dates, our Sun and Earth azimuth and elevation match NASA's Horizons
            system to better than <b>0.00001°</b>. These checks run automatically in our test suite. That checks the sky; the terrain (below) is
            the bigger source of uncertainty.
          </p>
        </section>

        <section>
          <h3>What blocks the view</h3>
          <p>
            The horizon around each site comes from NASA's Lunar Orbiter Laser Altimeter (<b>LOLA</b>): 5 m-per-pixel maps near each site and an
            80 m map of the whole polar region (NASA Goddard PGDA). For every 1° of compass direction we trace 5 rays out to 160 km, accounting
            for the Moon's curvature, and keep the highest terrain. The Moon has no air, so there is no atmospheric bending. In Street View the
            horizon line, Sun and Earth are drawn from this data at true angular size; Earth uses NASA's Blue Marble map at its real phase, and
            the rocks and ground texture are illustrative.
          </p>
          <p>
            “Visible” means the centre of the Sun or Earth is above that terrain, seen from 2 m above the ground. In Mission planner you can
            require the whole Sun disc, a radio margin for Earth, or a 5 m / 10 m mast.
          </p>
        </section>

        {moved.length > 0 && (
          <section>
            <h3>A comparison point we added</h3>
            {moved.map((s) => (
              <p key={s.id}>
                <b>{s.name}:</b> {s.point_note}
              </p>
            ))}
          </section>
        )}

        <section>
          <h3>Why these measures</h3>
          <p>
            NASA's key landing requirements for the first crewed south-pole landing include: land within 6° of the pole, ground sloping less
            than 10° over 100 m, a direct radio link with Earth (no relay satellite assumed), the surface lit for the whole stay, and touchdown
            within 100 m of the target (Dwyer Cianciolo, NASA Artemis Human Landing System update, 2024). Those are exactly what this tool
            checks.
          </p>
          <p>
            Every result starts from an <b>example landing date of 20 Nov 2028</b>, close to when the first crewed landing could happen
            (Artemis III became an Earth-orbit test; the landing moved to a later mission). In Mission planner you can pick any date.
          </p>
        </section>

        <section>
          <h3>What this tool does not model</h3>
          <ul>
            <li>
              Results are for a single point, not a whole landing area. Moving a few hundred metres can change sunlight by 30–50 points (walk
              around in Street View to see it), which is often more than the difference between sites.
            </li>
            <li>
              The horizon close to the lander comes from 5 m map cells, so a small error in nearby ground can shift sunrise and sunset by minutes
              to hours. Times are computed to the second, but they are not that accurate.
            </li>
            <li>Every analysis covers 30 days in late 2028. Battery checks use the longest night in that window, not over a whole year.</li>
            <li>Terrain is computed from NASA maps but not yet independently validated; peaks farther than 160 km are ignored.</li>
            <li>“Sunlight” is light reaching a panel, not guaranteed electrical power. “Earth in view” is line of sight, not a full radio link budget.</li>
            <li>
              No relay satellites (such as Gateway or NASA's planned lunar relays), no Deep Space Network scheduling, and no thermal model.
              Slope comes from one 5 m map cell; rocks are not mapped.
            </li>
            <li>Eclipses are included: when Earth passes in front of the Sun (as on 31 Dec 2028), the panels go dark.</li>
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
