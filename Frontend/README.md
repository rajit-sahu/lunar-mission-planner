# Frontend

React + TypeScript + Vite. A Google-Earth-style Moon globe that flies down to
the south pole, with a site dashboard, a global time slider, a surface view
and scenario comparison. All numbers come from the FastAPI backend (SPICE
ephemerides + LOLA terrain).

## Two layers

`mode` in the store is `"discover"` (default) or `"planner"`, remembered in
localStorage and linkable with `?layer=planner`. Every panel reads it:

| | Discover | Mission planner |
|---|---|---|
| Site list | traits ("Sunniest"), days of sunlight | coordinates, % bars, search |
| Dashboard | plain sentences, sunlight gauge | angles, clearance, visibility rules, energy, battery check, charts, stats |
| Timeline | play, day counter, one combined strip, "land a week late" toggle | UTC clock, speeds, landing date, delay chips, Sun/Earth/Both lanes |
| Third view | "Launch late?" (`LateView`) | Compare (`CompareView`) with constraints + delay simulator |
| Surface | sentences, true angles only | numeric readout, vertical exaggeration |

Landing decisions use `src/lib/metrics.ts`. Its metrics are measured from
touchdown: sunlit at touchdown, hours until the first sunset, Earth at
touchdown, power and radio in the first 72 h, the longest radio gap in week 1,
and energy. `rank()` applies constraints (including slope) and says why each
option passes or fails. The guided tour (`StoryTour.tsx`) drives the real app;
its delay sentence is computed from the data.

## Run it

Start the backend first (from the repo root, see `Backend/README.md`):

```bash
uvicorn Backend.app.main:app --reload
```

Then:

```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:8000` (override with
`VITE_BACKEND_URL`). For a deployed build, set `VITE_API_URL` to the
backend's URL.

## Where the data comes from

The top-right badge always says which source is on screen:

| Badge | Meaning |
|---|---|
| **Live · SPICE + LOLA** | Computed now by the backend |
| **Saved results · SPICE + LOLA** | Backend unreachable; real backend output saved in `public/fixtures/` |
| **Demo data (approximate)** | Neither available; a rough analytic model (`src/api/demo.ts`), never presented as science |

Refresh the saved results whenever the science changes (backend running):

```bash
npm run snapshot                       # default landing date + 3/7/14/30-day delays
npm run snapshot -- 2028-11-20 2029-01-15
```

## Deployment

| Part | Where | How it updates |
|---|---|---|
| Frontend | Vercel project `lunar-mission-planner` → https://lunar-mission-planner-alpha.vercel.app | Manual: `npx vercel deploy --prod` from `Frontend/` |
| Backend | Render web service `lunar-mission-planner-api` → https://lunar-mission-planner-api.onrender.com (from `render.yaml`) | Auto-deploys from `AryemanGuptaMathur/lunar-mission-planner` (a private fork, because Render can't read the team repo yet). After merging backend changes into the team repo, run `gh repo sync AryemanGuptaMathur/lunar-mission-planner` |

The Vercel build sets `VITE_API_URL` to the Render URL. Deployed builds use
the precomputed results in `public/fixtures/` first, because the free Render
CPU takes about 4 s per 30-day analysis. Dates that aren't precomputed are
calculated live. Local `npm run dev` is always live-first. Set
`VITE_LIVE_FIRST=true` to make a deployed build behave the same way.

**After any science or terrain change:** run the backend locally, then
`npm run snapshot`, commit the new fixtures, and redeploy. Otherwise the
site keeps serving the old precomputed numbers.

The free Render service sleeps after 15 minutes idle and takes 30–60 s to
wake. The app pings `/health` on load to start waking it.

## Map imagery

`public/textures/` holds JPGs stitched from NASA Moon Trek WMTS tiles
(LRO LOLA and LROC data), so the app needs no network for imagery:

| File | Layer | Coverage |
|---|---|---|
| `global_wac.jpg` | `LRO_WAC_Mosaic_Global_303ppd_v02` | whole Moon, equirectangular |
| `sp_outer_shade.jpg` | `LRO_LOLA_Shade_SPole75_30mp_v04` | ±400 km around the pole |
| `sp_outer_wac.jpg` | `LRO_WAC_Mosaic_SPole60_100m_v02` | ±400 km |
| `sp_outer_illum.jpg` | `LRO_LOLA_Illumination_SPole65S_240m` | ±400 km (only ~1 km/px on Moon Trek) |
| `sp_outer_earthvis.jpg` | `AVGVISIB_75S_120M_201608_EARTH_SP` | ±400 km |
| `sp_inner_shade.jpg` | `LRO_LOLA_Shade_SPole875_5mp_v04` (median-filtered) | ±40 km |

Polar files are south polar stereographic (sphere R = 1737.4 km, +y = 0°E,
+x = 90°E). Regenerate with `npm run bake:textures` (needs internet).
Orientation was checked against Shackleton, de Gerlache, Shoemaker and the
Malapert massif.

## Layout

```
src/
  api/          types.ts (mirrors Backend/README.md), client.ts (live → snapshot → demo), demo.ts
  state/        store.ts (zustand: site, global time, mode, scenarios), hooks.ts
  lib/          geo.ts (projections), timeline.ts (interpolation, countdowns), power.ts, metrics.ts (touchdown metrics, ranking)
  components/
    globe/      MoonGlobe (three.js / react-three-fiber), GlobeOverlay (pins, bearing arrows, scale)
    panels/     TopBar, SitePanel, SiteDashboard, TimelineDock, LayerSwitcher
    charts/     VisibilityLanes, SkyChart, ClearanceChart (plain SVG)
    pov/        SurfacePOV (Felix: stylized horizon view)
    compare/    CompareView (planner), LateView (discover)
    AboutDialog.tsx  "How do we know?" methods, validation, limits
    StoryTour.tsx    1-minute guided story
```

Every view reads the same `time` and `selectedSiteId` from the store, so the
globe, dashboard, POV and charts always show the same moment.

## Notes on accuracy

- Between the 30-minute timeline samples, angles are interpolated (azimuth
  wraps at 360°). Countdowns use the backend's refined windows (≈1 s).
- On the globe, the Sun's direction (day/night shading) comes from the
  sub-solar point worked out from the selected site's Sun azimuth/elevation.
  It is for display only.
- Solar power is irradiance on the panel (1361 W/m² × geometry), not
  electrical output.
- The surface view uses true angles by default. Vertical exaggeration is
  optional and always labelled on screen.

## Shortcuts

`Space` play/pause · `[` `]` step 6 h · `Esc` back / deselect · in Surface
view: drag or `←` `→` to look around, scroll to zoom.
