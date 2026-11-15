# Backend

FastAPI service that connects the science code to the frontend.

**Status:** every number is now computed from real data. Sun/Earth angles,
visibility, windows and statistics come from the SPICE pipeline
(`Science/science_pipeline.py`); site coordinates come from Arnav's
`config/sites.json`; terrain horizons, elevations and slopes come from NASA
LOLA elevation maps processed by Arnav's terrain pipeline
(`data/processed/`). The terrain is computed but **not yet validated**
(status `geotiff_calculated_pending_validation`). Every science response
says where its numbers came from (`ephemeris_source`, and `terrain_source`:
`"lola"`, or `"placeholder"` for a site with no terrain file).

**Validated:** Sun/Earth azimuth and elevation are apparent directions
(SPICE `LT+S`, observer fixed on the Moon) and match JPL Horizons to better
than 0.00001 deg; `tests/test_positions.py` checks this on every run.

**Shackleton Rim (site_004) and Shackleton crest (site_004_crest):** site_004
uses its published point, which sits in a hollow 10.5 m below the highest 5 m
LOLA cell 54 m away; nearby ground blocks the Sun and Earth there at 2 m.
site_004_crest is that crest, added by the team as a comparison point (not a
published site); see `representative_point_note` in `config/sites.json`.

## Run it

From the repository root:

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r Backend/requirements.txt
uvicorn Backend.app.main:app --reload
```

Then open http://localhost:8000/docs to try every endpoint in the browser.

For a visual check of the data, open http://localhost:8000/preview: a plain
charts page (sky view against the terrain horizon, visibility windows,
height above terrain, and the site comparison) that reads the live API. It
is a debugging and fallback view, not the real frontend, and it needs
internet access to load Plotly.

The SPICE kernels are loaded from `kernels/` at startup (set
`LUNAR_KERNELS_DIR` to use a different folder).

Tests: `python -m pytest` (science + API; Arnav's terrain suite: `cd Terrain && python -m pytest`)

## Conventions

| Quantity | Convention |
|---|---|
| Time | UTC, ISO 8601, ending in `Z` (a time with no offset is read as UTC) |
| Latitude / longitude | Degrees; north-positive / east-positive, longitude in 0 to 360 |
| Azimuth | Degrees clockwise from north, 0 to 360 |
| Elevation | Degrees above the local horizontal |
| Distance | Kilometres |
| Visibility | `true` when clearance (elevation minus terrain horizon at the body's azimuth) exceeds the threshold: by default the body's centre above the terrain |

## Visibility settings

`/position`, `/analysis` and `/compare` accept three optional parameters; the
defaults reproduce the original behaviour, and every response echoes them
under `settings`.

| Parameter | Values | Meaning |
|---|---|---|
| `sun_criterion` | `centre` (default), `limb`, `full` | Sun counts as visible when its centre / any part / its whole disc is above the terrain |
| `earth_margin_deg` | 0 (default) to 20 | Earth's centre must clear the terrain by this much (radio link margin) |
| `observer_height_m` | 2 (default), 5, 10 | Uses the horizon computed for that eye/mast height (`{site}_terrain_h5.json`, `_h10.json`) |

Timeline rows also report `sun_disc_fraction` / `earth_disc_fraction` (share
of each disc above the terrain) and `sun_distance_km`. Windows touching the
start or end of the range carry `clipped_start` / `clipped_end`, and
statistics carry `longest_visible_clipped` / `longest_not_visible_clipped`:
the true duration is at least the value given.

## Endpoints

The science endpoints return the science pipeline's JSON unchanged, with
`ephemeris_source` and `terrain_source` added.

### `GET /sites`

`elevation_m` and `slope_deg` are `null` until the site has real terrain.

```json
[{"id": "site_001", "name": "Connecting Ridge / Site 001",
  "latitude_deg": -89.45, "longitude_deg": 222.69,
  "elevation_m": 1954.847, "slope_deg": 9.403,
  "source": "Boazman et al., Planetary Science Journal (2022); ...",
  "note": "Representative published point, not an approved landing zone",
  "terrain_source": "lola"}]
```

### `GET /sites/{id}/terrain`

The terrain pipeline's full JSON for the site, unchanged (elevation, slope,
quality flags, and 360 `terrain_horizon` rows). Returns 404 until a real
terrain file exists for the site.

### `GET /sites/{id}/horizon`

The horizon actually used for visibility, as two plain lists: real when
available, otherwise the placeholder.

```json
{"site_id": "site_001", "terrain_source": "placeholder",
 "horizon_azimuths": [0, 1, 2], "horizon_elevations": [1.7, 1.8, 1.9]}
```

### `GET /sites/{id}/position?time=2028-11-20T12:00:00Z`

One moment in time: for the time slider, dashboard and surface POV.

```json
{
  "site_id": "site_malapert",
  "time": "2028-11-20T12:00:00Z",
  "sun":   {"azimuth_deg": 105.9, "elevation_deg": -0.6, "distance_km": 147900000.0,
            "visible": false, "terrain_horizon_deg": 1.2, "clearance_deg": -1.8},
  "earth": {"azimuth_deg": 2.6, "elevation_deg": 5.1, "distance_km": 380100.0,
            "visible": true, "terrain_horizon_deg": 2.3, "clearance_deg": 2.8},
  "both_visible": false,
  "ephemeris_source": "spice",
  "terrain_source": "placeholder"
}
```

### `GET /sites/{id}/analysis?start=...&end=...&step_minutes=15`

The output of `run_site_analysis()`: a timeline, visibility windows with
transition times refined to about a second, and summary statistics.

```json
{
  "site_id": "site_malapert",
  "coordinates": {"latitude_deg": -85.992, "longitude_deg": 2.056, "elevation_km": 0.0},
  "timeline": [
    {"time": "2028-11-20T00:00:00Z",
     "sun_azimuth_deg": 112.2, "sun_elevation_deg": -0.8,
     "sun_horizon_deg": 2.0, "sun_clearance_deg": -2.8,
     "earth_azimuth_deg": 336.4, "earth_elevation_deg": 4.0,
     "earth_horizon_deg": 2.0, "earth_clearance_deg": 2.0,
     "sun_visible": false, "earth_visible": true, "both_visible": false}
  ],
  "windows": {
    "sun":   [{"start": "2028-11-22T16:20:14.959193Z", "end": "2028-12-04T00:00:00Z",
               "duration_hours": 271.66}],
    "earth": [],
    "both":  []
  },
  "statistics": {
    "sun": {"visible_hours": 271.66, "visible_percent": 80.85,
            "longest_visible_hours": 271.66, "longest_not_visible_hours": 64.34},
    "earth": {},
    "both": {}
  },
  "ephemeris_source": "spice",
  "terrain_source": "placeholder"
}
```

To compare the same site on different dates (for example a 7-day mission
delay), call this endpoint once per date range.

### `GET /compare?site_ids=a&site_ids=b&start=...&end=...&step_minutes=15`

The output of `run_site_comparison()`: a compact `comparison` table (one row
per site, in the order requested) plus the full analysis of each site under
`sites`. A complete example is in `tests/example_science_output.json`.

```json
{
  "start_time": "2028-11-20T00:00:00Z",
  "end_time": "2028-12-04T00:00:00Z",
  "step_minutes": 15,
  "comparison": [
    {"site_id": "site_malapert", "sun_visible_percent": 80.9,
     "earth_visible_percent": 100.0, "both_visible_percent": 80.9,
     "longest_darkness_hours": 64.3, "longest_earth_outage_hours": 0.0,
     "longest_simultaneous_visibility_hours": 271.7}
  ],
  "sites": ["...one /analysis-shaped object per site..."],
  "ephemeris_source": "spice",
  "terrain_sources": {"site_malapert": "placeholder"}
}
```

Requests are limited to 5000 timeline samples per site.

## Regenerating terrain

The files in `data/processed/` were generated on 2026-11-15 from
`LDEM_80S_80MPP_ADJ.TIF` (80 m) plus each site's 5 m elevation and slope
maps (Site01, Site04, Site23) from https://pgda.gsfc.nasa.gov, with the
pipeline's default settings (2 m observer, 120 km range). The source maps
(about 485 MB) are not in the repo.

To regenerate or add a site: unzip `Arnav_Lunar_Terrain_Project.zip`,
follow its README to download the maps and run its CLI, copy the resulting
`data/processed/{site_id}_terrain.json` here, and restart the server.

What the backend does with a terrain file:

- Uses it only if its `status` is `geotiff_calculated_pending_validation`.
  Synthetic fixtures and schema examples are ignored.
- Places the observer at `elevation_m + observer_height_m`, so the Sun/Earth
  angles are computed from the same point the horizon was.
- If any horizon azimuth has no data (`elevation_deg: null`), the science
  endpoints for that site return **409** instead of treating the gap as
  clear sky. `/sites/{id}/terrain` still serves the file.
