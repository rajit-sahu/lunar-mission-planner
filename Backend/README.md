# Backend

FastAPI service that connects the science code to the frontend.

**Status:** the Sun/Earth angles, terrain horizons and site coordinates are
all **placeholders** for now. The numbers are made up, but the JSON shape is
what the real data will use, so the frontend can build against it today.
Every response says where its numbers came from (`ephemeris_source`,
`terrain_source`).

## Run it

From the repository root:

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r Backend/requirements.txt
uvicorn Backend.app.main:app --reload
```

Then open http://localhost:8000/docs to try every endpoint in the browser.

Tests: `python -m pytest Backend`

## Conventions

| Quantity | Convention |
|---|---|
| Time | UTC, ISO 8601, ending in `Z` (a time with no offset is read as UTC) |
| Latitude / longitude | Degrees; north-positive / east-positive |
| Azimuth | Degrees clockwise from north, 0 to 360 |
| Elevation | Degrees above the local horizontal |
| Distance | Kilometres |
| Visibility | `true` when the body's elevation is above the terrain horizon at its azimuth |

## Endpoints

### `GET /sites`

```json
[{"id": "malapert-massif", "name": "Malapert Massif", "latitude_deg": -86.0,
  "longitude_deg": 0.0, "elevation_km": 0.0, "placeholder": true}]
```

### `GET /sites/{id}/position?time=2028-11-20T12:00:00Z`

```json
{
  "site_id": "malapert-massif",
  "time": "2028-11-20T12:00:00Z",
  "ephemeris_source": "placeholder",
  "terrain_source": "placeholder",
  "sun":   {"azimuth_deg": 312.4, "elevation_deg": 1.9, "distance_km": 149600000.0,
            "horizon_elevation_deg": 0.8, "visible": true},
  "earth": {"azimuth_deg": 4.1, "elevation_deg": 6.2, "distance_km": 384400.0,
            "horizon_elevation_deg": 2.3, "visible": true},
  "both_visible": true
}
```

### `GET /sites/{id}/timeline?start=...&end=...&step_minutes=60`

`samples` is column-oriented: every list has one entry per time step, so a
list can go straight into a Plotly trace. At most 5000 samples per request.

```json
{
  "site_id": "malapert-massif",
  "start": "2028-11-01T00:00:00Z",
  "end": "2028-12-01T00:00:00Z",
  "step_minutes": 60,
  "ephemeris_source": "placeholder",
  "terrain_source": "placeholder",
  "samples": {
    "time": ["2028-11-01T00:00:00Z", "..."],
    "sun":   {"azimuth_deg": [], "elevation_deg": [], "visible": []},
    "earth": {"azimuth_deg": [], "elevation_deg": [], "visible": []},
    "both_visible": []
  },
  "windows": {
    "sun":   [{"start": "2028-11-03T08:00:00Z", "end": "2028-11-17T20:00:00Z"}],
    "earth": [],
    "both":  []
  }
}
```

A window's `end` is the first sample where the body is blocked again, so
windows are accurate to one `step_minutes`.

### `GET /sites/{id}/horizon`

```json
{"site_id": "malapert-massif", "terrain_source": "placeholder",
 "azimuth_deg": [0, 1, 2], "horizon_elevation_deg": [1.7, 1.8, 1.9]}
```

## Plugging in the real science

All science calls go through `app/science.py`; nothing else needs to change.

- **Sun/Earth positions (Madhav):** already wired to
  `Science/ephemeris/sun_earth_positions.py`. Put the SPICE kernels in a
  folder and set `LUNAR_KERNELS_DIR` to it before starting the server.
  Without that variable the placeholder is used.
- **Terrain horizon (Arnav):** needs a function
  `horizon_profile(site_id, latitude_deg, longitude_deg)` returning
  `{"azimuth_deg": [...], "horizon_elevation_deg": [...]}` (any spacing,
  sorted by azimuth). Point `horizon_profile` in `app/science.py` at it and
  set `TERRAIN_SOURCE = "lola"`.
- **Site coordinates (Arnav):** edit `app/sites.py`.
