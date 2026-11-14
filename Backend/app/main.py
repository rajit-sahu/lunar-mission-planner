"""Lunar South Pole Mission Planner API.

Run from the repository root:  uvicorn Backend.app.main:app --reload
Interactive docs:              http://localhost:8000/docs

The science endpoints return the science pipeline's JSON unchanged, plus
ephemeris_source and terrain_source. tests/example_science_output.json is a
full example of the /compare response.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import science
from .sites import SITES

MAX_SAMPLES = 5000  # per site, per request

app = FastAPI(title="Lunar South Pole Mission Planner API", version="0.2.0")

# Open CORS so the React dev server (any localhost port) can call the API.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])

START = Query(description="UTC ISO 8601, e.g. 2028-11-20T00:00:00Z")
END = Query(description="UTC ISO 8601, after start")
STEP = Query(15, ge=1, description="Minutes between timeline samples")


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


def _sources() -> dict:
    return {
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_source": science.TERRAIN_SOURCE,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", **_sources()}


@app.get("/sites")
def list_sites() -> list[dict]:
    return list(SITES.values())


@app.get("/sites/{site_id}/horizon")
def get_horizon(site_id: str) -> dict:
    _check_site(site_id)
    site = science.site_input(site_id)
    return {
        "site_id": site_id,
        "terrain_source": science.TERRAIN_SOURCE,
        "horizon_azimuths": site["horizon_azimuths"],
        "horizon_elevations": site["horizon_elevations"],
    }


@app.get("/sites/{site_id}/position")
def get_position(
    site_id: str,
    time: datetime = Query(description="UTC ISO 8601, e.g. 2028-11-20T12:00:00Z"),
) -> dict:
    """Sun/Earth angles and visibility at one moment (for the time slider and POV)."""
    _check_site(site_id)
    return {**science.position(site_id, _iso(time)), **_sources()}


@app.get("/sites/{site_id}/analysis")
def get_analysis(
    site_id: str, start: datetime = START, end: datetime = END, step_minutes: int = STEP
) -> dict:
    """Timeline, visibility windows and statistics for one site (run_site_analysis)."""
    _check_site(site_id)
    first, last = _range(start, end, step_minutes)
    return {**science.analysis(site_id, first, last, step_minutes), **_sources()}


@app.get("/compare")
def compare(
    site_ids: list[str] = Query(description="Repeat for each site: ?site_ids=a&site_ids=b"),
    start: datetime = START,
    end: datetime = END,
    step_minutes: int = STEP,
) -> dict:
    """Side-by-side comparison of several sites over one interval (run_site_comparison)."""
    for site_id in site_ids:
        _check_site(site_id)
    first, last = _range(start, end, step_minutes)
    return {**science.comparison(site_ids, first, last, step_minutes), **_sources()}
