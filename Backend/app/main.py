"""Lunar South Pole Mission Planner API.

Run from the repository root:  uvicorn Backend.app.main:app --reload
Interactive docs:              http://localhost:8000/docs

The science endpoints return the science pipeline's JSON unchanged, plus
fields saying where the numbers came from. tests/example_science_output.json
is a full example of the /compare response.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from . import science
from .sites import SITES

MAX_SAMPLES = 5000  # per site, per request
PREVIEW_PAGE = Path(__file__).parent / "static" / "preview.html"

app = FastAPI(title="Lunar South Pole Mission Planner API", version="0.4.0")

# Open CORS so the React dev server (any localhost port) can call the API.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])

START = Query(description="UTC ISO 8601, e.g. 2028-11-20T00:00:00Z")
END = Query(description="UTC ISO 8601, after start")
STEP = Query(15, ge=1, description="Minutes between timeline samples")
SUN_CRITERION = Query(
    "centre",
    description="When the Sun counts as visible: 'limb' (any part above terrain), "
    "'centre', or 'full' (whole disc above terrain).",
)
EARTH_MARGIN = Query(0.0, ge=0, le=20, description="Degrees Earth's centre must clear the terrain (link margin).")
HEIGHT = Query(2, description="Observer height above the surface in metres (2, 5 or 10).")


def _settings(sun_criterion: str, earth_margin_deg: float, observer_height_m: int) -> dict:
    if observer_height_m not in science.OBSERVER_HEIGHTS_M:
        raise HTTPException(400, f"observer_height_m must be one of {list(science.OBSERVER_HEIGHTS_M)}.")
    return {
        "sun_criterion": sun_criterion,
        "earth_margin_deg": earth_margin_deg,
        "observer_height_m": observer_height_m,
        "thresholds_deg": science.visibility_thresholds(sun_criterion, earth_margin_deg),
    }


@app.exception_handler(science.IncompleteTerrain)
def incomplete_terrain(request: Request, exc: science.IncompleteTerrain) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(science.MissingHeight)
def missing_height(request: Request, exc: science.MissingHeight) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def _check_site(site_id: str) -> None:
    if site_id not in SITES:
        raise HTTPException(404, f"Unknown site '{site_id}'. See /sites for valid ids.")


def _iso(value: datetime) -> str:
    """Normalise to a UTC 'Z' string; a time without an offset is read as UTC."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _range(start: datetime, end: datetime, step_minutes: int) -> tuple[str, str]:
    if end <= start:
        raise HTTPException(400, "end must be after start.")
    samples = int((end - start).total_seconds() // (step_minutes * 60)) + 1
    if samples < 2:
        raise HTTPException(400, "Range must cover at least one step_minutes.")
    if samples > MAX_SAMPLES:
        raise HTTPException(
            400,
            f"Range needs {samples} samples; the limit is {MAX_SAMPLES}. "
            "Use a larger step_minutes or a shorter range.",
        )
    return _iso(start), _iso(end)


def _sources(site_id: str, height_m: int = science.DEFAULT_HEIGHT_M) -> dict:
    return {
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_source": science.terrain_source(site_id, height_m),
    }


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/preview")


@app.get("/preview", include_in_schema=False)
def preview() -> FileResponse:
    """A plain charts page for eyeballing the data; not the real frontend."""
    return FileResponse(PREVIEW_PAGE)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_sources": {site_id: science.terrain_source(site_id) for site_id in SITES},
    }


@app.get("/sites")
def list_sites() -> list[dict]:
    """Site list. elevation_m and slope_deg are null until real terrain exists."""
    result = []
    for site_id, site in SITES.items():
        terrain = science.terrain(site_id) or {}
        result.append(
            {
                "id": site_id,
                "name": site["name"],
                "latitude_deg": terrain.get("latitude_deg", site["latitude_deg"]),
                "longitude_deg": terrain.get("longitude_deg", site["longitude_deg"]),
                "elevation_m": terrain.get("elevation_m"),
                "slope_deg": terrain.get("slope_deg"),
                "source": site.get("source"),
                "note": site.get("note"),
                "terrain_source": science.terrain_source(site_id),
                "observer_heights_m": science.available_heights(site_id),
                "point_note": terrain.get("representative_point_note"),
                "context": site.get("context"),
            }
        )
    return result


@app.get("/sites/{site_id}/terrain")
def get_terrain(site_id: str) -> dict:
    """The terrain pipeline's full JSON for a site, unchanged."""
    _check_site(site_id)
    terrain = science.terrain(site_id)
    if terrain is None:
        raise HTTPException(404, f"No processed LOLA terrain for '{site_id}' yet.")
    return terrain


@app.get("/sites/{site_id}/horizon")
def get_horizon(site_id: str, observer_height_m: int = HEIGHT) -> dict:
    """The horizon actually used for visibility: real if available, else placeholder."""
    _check_site(site_id)
    _settings("centre", 0.0, observer_height_m)
    site = science.site_input(site_id, observer_height_m)
    return {
        "site_id": site_id,
        "observer_height_m": observer_height_m,
        "terrain_source": science.terrain_source(site_id, observer_height_m),
        "horizon_azimuths": site["horizon_azimuths"],
        "horizon_elevations": site["horizon_elevations"],
    }


@app.get("/sites/{site_id}/position")
def get_position(
    site_id: str,
    time: datetime = Query(description="UTC ISO 8601, e.g. 2028-11-20T12:00:00Z"),
    sun_criterion: Literal["limb", "centre", "full"] = SUN_CRITERION,
    earth_margin_deg: float = EARTH_MARGIN,
    observer_height_m: int = HEIGHT,
) -> dict:
    """Sun/Earth angles and visibility at one moment (for the time slider and POV)."""
    _check_site(site_id)
    cfg = _settings(sun_criterion, earth_margin_deg, observer_height_m)
    result = science.position(site_id, _iso(time), observer_height_m, cfg["thresholds_deg"])
    return {**result, "settings": cfg, **_sources(site_id, observer_height_m)}


@app.get("/sites/{site_id}/analysis")
def get_analysis(
    site_id: str,
    start: datetime = START,
    end: datetime = END,
    step_minutes: int = STEP,
    sun_criterion: Literal["limb", "centre", "full"] = SUN_CRITERION,
    earth_margin_deg: float = EARTH_MARGIN,
    observer_height_m: int = HEIGHT,
) -> dict:
    """Timeline, visibility windows and statistics for one site (run_site_analysis)."""
    _check_site(site_id)
    first, last = _range(start, end, step_minutes)
    cfg = _settings(sun_criterion, earth_margin_deg, observer_height_m)
    result = science.analysis(site_id, first, last, step_minutes, observer_height_m, cfg["thresholds_deg"])
    return {**result, "settings": cfg, **_sources(site_id, observer_height_m)}


@app.get("/compare")
def compare(
    site_ids: list[str] = Query(description="Repeat for each site: ?site_ids=a&site_ids=b"),
    start: datetime = START,
    end: datetime = END,
    step_minutes: int = STEP,
    sun_criterion: Literal["limb", "centre", "full"] = SUN_CRITERION,
    earth_margin_deg: float = EARTH_MARGIN,
    observer_height_m: int = HEIGHT,
) -> dict:
    """Side-by-side comparison of several sites over one interval (run_site_comparison)."""
    for site_id in site_ids:
        _check_site(site_id)
    first, last = _range(start, end, step_minutes)
    cfg = _settings(sun_criterion, earth_margin_deg, observer_height_m)
    return {
        **science.comparison(site_ids, first, last, step_minutes, observer_height_m, cfg["thresholds_deg"]),
        "settings": cfg,
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_sources": {site_id: science.terrain_source(site_id, observer_height_m) for site_id in site_ids},
    }
