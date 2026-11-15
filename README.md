# Lunar South Pole Mission Planner

**NASA Space Apps Challenge 2026 · [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)**

**Try it:** https://lunar-mission-planner-alpha.vercel.app

At the Moon's south pole the Sun never climbs more than a degree or two, so
a ridge a few metres high decides whether a lander has solar power, and Earth
drifts in and out of view as the Moon wobbles. This tool shows, for candidate
landing sites and dates, when a lander would have sunlight and a direct radio
line to Earth, and how that changes when a launch slips.

## Two layers

- **Discover** (default) is for everyone. Plain-language status ("The Sun is up. It
  sets in about 3 days."), one timeline strip, a "Stand here" horizon view, a
  "What if we land late?" story, and a 1-minute guided tour.
- **Mission planner** (switch at top right, or `?layer=planner`) adds:
  - Sun/Earth azimuth, elevation and terrain clearance, sky and clearance charts, 30-day statistics.
  - Visibility rules: Sun top edge / centre / whole disc, Earth radio margin, 2/5/10 m mast.
  - Solar energy, and a battery check against the longest night.
  - Scenario comparison measured from touchdown, with constraints and a delay simulator that names the best site for each landing date.

## How the challenge maps to the app

| Challenge asks for | Where |
|---|---|
| Interactive site selection and comparison | 3D Moon globe with NASA LOLA/LROC polar layers; Compare view (up to 3 site/date scenarios) |
| Date and time flexibility | Landing date, delay buttons (+3/7/14/30 d), global time slider shared by every view |
| Sun and Earth position relative to the horizon | Sky chart, Sun/Earth bearing arrows on the map, "Stand on the Moon" horizon view at true angles |
| Time until sunset / Earthset | Countdowns on every site; timeline lanes with refined windows |
| Power and communication assessment | Irradiance and daily energy (scaled by the visible Sun disc), Earth visibility with radio margin, battery check |
| Temporal dynamics | Play/scrub a 30-day window; delay simulator |
| Accessibility across skill levels | Discover / Mission planner layers, guided story, keyboard and screen-reader support, reduced motion |

## Science

- **Ephemeris:** NAIF SPICE (DE440, MOON_ME), apparent directions with light-time and aberration. **Matches JPL Horizons to better than 0.00001°**, checked automatically in `tests/test_positions.py`.
- **Terrain:** NASA LRO LOLA 5 m site maps plus the 80 m south-polar map (NASA Goddard PGDA). The 360° horizon is traced out to 160 km, accounting for lunar curvature, with 5 rays per degree. Horizons are computed for 2, 5 and 10 m observer heights.
- **Visibility windows:** refined to about a second with root-finding. Windows that run past the analysed range are flagged.
- **Limits:**
  - Results are for a single point, not the whole ~100 m landing area.
  - Terrain is pending independent validation.
  - Irradiance is not electrical power.
  - Earth visibility is line of sight, not a link budget.

  The in-app **"How do we know?"** dialog explains all of this in plain language.

## Repository

| Folder | What | Owner |
|---|---|---|
| `Frontend/` | React + TypeScript + three.js app ([README](Frontend/README.md)) | Aryeman, Felix (surface view) |
| `Backend/` | FastAPI service ([README](Backend/README.md)) | Rajit |
| `Science/` | SPICE geometry, visibility, windows, comparison | Madhav |
| `Terrain/` | LOLA terrain → horizon pipeline | Arnav |
| `data/processed/` | Horizon files used by the backend | |
| `kernels/` | SPICE kernels | |
| `tests/` | Science test suite (`python -m pytest`) | |

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r Backend/requirements.txt
uvicorn Backend.app.main:app --reload          # API on :8000
cd Frontend && npm install && npm run dev       # app on :5173
```

Hosting: the frontend is on Vercel. The backend runs on Render from `render.yaml`. See [Frontend/README.md](Frontend/README.md#deployment).

Sites are representative published points (Kumari et al. 2022; Wueller et al.
2026), not approved landing zones.
