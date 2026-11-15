# Lunar South Pole Mission Planner — Arnav's Terrain Module

**Purpose:** Reproducibly process NASA LRO/LOLA GeoTIFF terrain data into representative landing-site elevation, slope and a 360° lunar horizon profile for Madhav, Felix, Rajit and Aryeman.

**Truth in outputs:** This repository ships code, verified site coordinate references, automated geometry tests, and a **synthetic-only test fixture**. It does **not** ship downloaded NASA GeoTIFFs or claim to contain measured NASA terrain profiles before you run the real data. Scientific sign-off requires dataset and ephemeris cross-validation.

## Quick start

Run from the folder `lunar-terrain-arnav/`:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q
```

### Download the NASA DEMs (requires internet)

For a first one-site end-to-end test, download:

```bash
python scripts/download_data.py regional-80m site01-elevation site01-slope
```

The first model is the broad terrain layer; site DEM is the local finer layer. NASA URLs are recorded in `scripts/download_data.py`.

NASA sources:
- [5 m individual south-pole sites](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/): Site 01, 04, 23 DEM and slope products.
- [80 m large-area south-pole DEM](https://pgda.gsfc.nasa.gov/products/90): `LDEM_80S_80MPP_ADJ.TIF` (~181 MB), DEM coverage to 80°S.

**Important:** 80 m data alone is not a suitable basis for small hazard-scale slope or a finely accurate nearby horizon. Use the 5 m DEM for nearby terrain when possible, and 80 m for distant ridges. Both may have many interpolated pixels and uncertainties.

### Calculate Connecting Ridge (Site 001)

Order the elevation files from highest resolution to broadest fallback:

```bash
python -m science.terrain.cli \
  --site site_001 \
  --dem data/raw/Site01_final_adj_5mpp_surf.tif \
  --dem data/raw/LDEM_80S_80MPP_ADJ.TIF \
  --slope-map site_001=data/raw/Site01_final_adj_5mpp_slp.tif
```

On Windows PowerShell, type this command on one line, or replace each trailing `\` with PowerShell's backtick continuation character.

**Expected outputs after successful NASA data processing:**

```text
data/processed/site_001_terrain.json
data/processed/site_001_horizon.csv
plots/site_001_horizon.png
```

Process the other sites after getting Site 001 to work. Download their DEMs:

```bash
python scripts/download_data.py site04-elevation site04-slope site23-elevation site23-slope
```

Then add commands:

```bash
python -m science.terrain.cli --site site_004 --dem data/raw/Site04_final_adj_5mpp_surf.tif --dem data/raw/LDEM_80S_80MPP_ADJ.TIF --slope-map site_004=data/raw/Site04_final_adj_5mpp_slp.tif
python -m science.terrain.cli --site site_malapert --dem data/raw/Site23_final_adj_5mpp_surf.tif --dem data/raw/LDEM_80S_80MPP_ADJ.TIF --slope-map site_malapert=data/raw/Site23_final_adj_5mpp_slp.tif
```

If the published point is outside a site's 5 m DEM footprint, the 80 m DEM will provide a fallback and slope will use the 50 m baseline central-difference method. **Report the effective resolution rather than claiming 5 m values for an 80 m fallback.**

### Run fast synthetic smoke test

```bash
python -m scripts.create_synthetic_fixture
python -m science.terrain.cli --site site_001 --dem examples/SYNTHETIC_test_dem.tif \
  --max-distance-km 1 --near-step-m 20 --mid-step-m 40 \
  --far-step-m 80 --outer-step-m 160 --output-dir examples/synthetic_results --plots-dir examples/synthetic_plots
```

**These plots and JSON are synthetic, NOT LOLA terrain data.** The plot tests rendering and the deliberately raised test hill, not real mission-site conditions. Do not mix them into the science demo.

## Dataset, reference frames and assumptions

- Lunar latitude: **planetocentric**, negative in south; longitude positive **east**, 0–360°.
- All DEM maps: verified by NASA documentation as **MOON_ME (DE421)** with south polar stereographic X/Y in meters. The code uses the native dataset CRS (with a lunar geographic CRS using radius 1,737,400 m) to transform sampling positions. Check GeoTIFF geotransforms and prime meridian before running; georeferencing metadata alone **does not** prove frame alignment.
- `MOON_ME` is a lunar body-fixed reference. It is **not identical by definition** to SPICE `IAU_MOON`, nor does a map CRS string enforce a DE421 epoch. Coordinate frame rotation between team components must be explicitly handled or independently validated.
- Lunar topography elevation Z is in meters relative to the reference sphere. Default observer height is **2 m above the surface**.
- Local vertical is radial to the lunar center (spherical approximation); no gravitational deflection / local geoid correction.
- Each azimuth ray samples terrain at finite spacings. 10 m near, 50 m intermediate, 250 m to 40 km, and 500 m beyond (change via CLI).
- Curvature is modeled in 3D with Moon-centered vectors, not flat Earth geometry. It does not model atmosphere/refraction (the Moon has negligible atmosphere).
- Radial horizon search ends at 120 km by default. A distant obstacle beyond the range, undersampled ridge, or missing raster data can increase the actual horizon. Calculated angular maxima are **lower-bound estimates** until convergence/coverage is validated.
- Negative horizon elevations are valid. Missing samples are stored as JSON `null`. `quality` reports gaps and data coverage. When `horizon_samples_are_complete` is false, the horizon is provisional and cannot certify visibility. Never infer visible Sun/Earth from a horizon bin with unknown samples.
- Slope: NASA supplied slope map when provided; otherwise 50 m baseline finite-difference slope (may be inaccurate at 80 m resolution, so label the method and use for context only).
- This module computes *terrain*, NOT Sun/Earth ephemerides, solar power, surface energy, safety certifications or communication link margins.

## Output JSON

Each output has `site_id`, `latitude_deg`, `longitude_deg`, `elevation_m`, `slope_deg`, `observer_height_m`, `quality`, `model` and `terrain_horizon` (360 rows). Each horizon row gives `azimuth_deg`, `elevation_deg` (terrain angular horizon), `obstruction_distance_km`, `dem_sample_coverage_fraction` and `nearest_valid_dem_sample_m`.

See `TEAM_HANDOFF.md` for what to tell the rest of the team. `examples/sample_frontend_contract.json` is a schema example only, not measured data.

## Scientific validation checklist

1. **Projection:** Compare converted site coordinates with QuickMap/Moon Trek and the DEM shape / metadata; check no lat-long sign inversion or 180° prime-meridian rotation.
2. **Elevation:** Compare a pixel value with an independent LOLA/QuickMap reference; inspect NASA no-data convention and vertical datum.
3. **Slope:** Compare multiple points with `Site01_final_adj_5mpp_slp.tif`; note the resolution/baseline of the slope estimate.
4. **360° profile:** Cross-check ridge directions, distinguish azimuth NORTH from raster +Y, verify negative angular horizons and the 0°/360° boundary.
5. **Convergence:** Halve distance spacing / angular sampling and increase far range, looking for >0.1° deviations in terrain angles; do not claim a tolerance you have not verified.
6. **With Madhav:** Compare SPICE and independent JPL Horizons Sun/Earth az/el and verify terrain visibility transitions. The 2 m observer height must agree.
7. **Coverage:** Check `quality` before publishing. An incomplete horizon cannot certify an unblocked line-of-sight.

## Sources

- NASA PGDA: https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/
- NASA large-area LOLA maps: https://pgda.gsfc.nasa.gov/products/90
- Kumari et al. (2022) Site 001/004 coordinates: https://doi.org/10.3847/PSJ/aca590
- Wueller et al. (2026) Appendix A / MMA_K2023 coordinates: https://doi.org/10.1029/2025JE009434
- Barker et al. (2021) high-resolution LOLA elevation maps: https://doi.org/10.1016/j.pss.2020.105119

## Limitations

NASA data download must be performed on a network that can reach Goddard, and the GeoTIFFs are too large to track in Git. Scientific data have *not* been fetched or independently validated in the generated zip. The script errors on unavailable input or on zero coverage rather than silently producing false numbers.

## Inspect dataset metadata before calculations

```bash
python -m scripts.inspect_dem --dem data/raw/Site01_final_adj_5mpp_surf.tif
```

This reports the raster CRS, pixel size, bounds, and whether the published points fall within its coverage. A site within the bounds does **not** by itself prove that the reference frame, pixel values or projection convention is correct.

For backend integration, `examples/consume_terrain_json.py` illustrates conservative line-of-sight visibility and refuses synthetic input or incomplete data.

## Reproducing the shipped horizon files

The files in `../data/processed/` (used by the backend) were made with
`scripts/regenerate_shipped.sh`: 2, 5 and 10 m observer heights, 160 km range,
`--subrays-per-bin 5`, and all three 5 m site DEMs plus the 80 m polar DEM.
The defaults described above (120 km, 1 ray per bin) reproduce the earlier files.
All sites use published points; `site_004_crest` is the extra comparison point from
`scripts/find_crest.py` (highest 5 m cell within 100 m of Shackleton Rim's published point).

## Street View viewpoints (frontend "Stand here")

`scripts/streetview_points.py` builds `Frontend/public/streetview/{site}.json` + `{site}_map.png`:
the landing point (horizon copied from `data/processed`), 8 points on a 400 m ring, and the
highest and lowest ground within 1.5 km, each with a full 360-degree horizon (2 m observer,
160 km, 3 rays per degree), elevation, slope, links to points within 900 m, and positions on a
hillshade minimap of the 5 m DEM.

```bash
cd Terrain
python -m scripts.streetview_points --raw data/raw --out ../Frontend/public/streetview
```

The frontend re-expresses the landing point's SPICE Sun/Earth directions in each viewpoint's
local horizon frame (`Frontend/src/lib/sky.ts`); this matches SPICE run at the viewpoint exactly.
