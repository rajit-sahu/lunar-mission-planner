# Terrain package handoff (Arnav)

## 1. Stable data contract

- CSV/JSON time convention (other team): UTC ISO 8601; terrain JSON is *time-independent*.
- Latitude: planetocentric degrees, positive north (south pole negative).
- Longitude: degrees EAST normalized to `[0, 360)`. E.g. 137.31° W = 222.69° E.
- Azimuth: clockwise from LOCAL north, in degrees; first 360 horizon bins are integers 0..359.
- Elevation angle: signed degrees above the local tangent plane to spherical Moon at observer.
- DEM elevation: meters above a lunar reference sphere, radius 1,737,400 meters.
- Observer height: 2 m default, added to DEM height. The same value must be used in the Sun/Earth geometry.
- Moon-fixed frame: MOON_ME (JPL DE421); see README for frame caveats.
- Missing `elevation_deg: null` means UNKNOWN, **not unblocked**.

## 2. Files delivered to other team members

After processing official DEMs, share `data/processed/{site_id}_terrain.json`, `data/processed/{site_id}_horizon.csv` and `plots/{site_id}_horizon.png`.
Do not send files from `examples/SYNTHETIC*` as real results.

### Madhav: Sun/Earth geometry and visibility

For each body at azimuth A and elevation e, interpolate terrain horizon angular elevation `h(A)` across circular array bins, then check `e > h(A)`. Use `science/terrain/geometry.py:visibility` as reference. If either surrounding bin is unknown, visibility must be unknown, not `true`. Even a numeric terrain horizon is provisional if `quality.horizon_samples_are_complete` is false; show a coverage warning and do not claim a validated clear line of sight.

**Critical**: Madhav's Earth/Sun azimuth and Arnav's terrain azimuth must be defined in same Moon-fixed frame and observer ENU. SPICE body elevation must be calculated at `(R+z+observer_height)*up`, **not Moon center**. Check both teams use planetocentric latitude or convert consistently.

### Felix: 2D lunar POV

Read `terrain_horizon` (`azimuth_deg`, `elevation_deg`) and render horizon height versus azimuth. Negative horizons are possible. Use same angular scale for Sun/Earth markers and horizon. Keep world orientation at 0°/360° circular, and show `null` spans as *unknown* rather than assuming clear sky.

### Rajit: backend

Serve the JSON without changing angles or reference frames, e.g. `GET /api/terrain/{site_id}` from `data/processed/{site_id}_terrain.json`. Consider endpoint `GET /api/sites` for lat/lon options from `config/sites.json`. Cache terrain once. The 360-row profile should not be recomputed for each date.

### Aryeman: UI

Use site name, latitude/longitude, elevation, slope, quality flag, and horizon plot in Analyse Mode. Only display terrain-aware visibility as verified when both geometry and horizon have valid source data; never treat schema-only/synthetic placeholders as measurements.

## 3. Integration acceptance tests

- All 360 bins present and ordered ascending from 0 to 359, no duplicated azimuth.
- 0° is north; 90° is east; 180° is south; 270° is west.
- 359.5° correctly interpolates between bins 359 and 0.
- Sun and Earth visibility agree between Madhav dashboard and Felix POV for same time and site.
- `elevation_deg` is the **angular horizon**; `elevation_m` is the **terrain altitude**. These cannot be interchanged.
- Validate near-site horizon against a manually inspected cross-section and reference Moon Trek/QuickMap terrain.
- Check 5m site DEM and broader 80m DEM overlap at one or more test locations within stated uncertainties. Flag any vertical offset rather than combining blindly.

## 4. Before calling it scientifically validated

- Confirm the DE421 Moon_ME reference and planetary lat/lon map parameters for each downloaded DEM.
- Compare computed local slopes to NASA slope product at multiple sites.
- Quantify horizon errors with at least one finer ray/azimuth sample spacing run.
- Quantify missing coverage and account for terrain outside max sample range.
- Verify heights and orientations by checking known terrain in QuickMap or Moon Trek.
- Do not claim this analysis certifies safe landings or power/communications performance.
