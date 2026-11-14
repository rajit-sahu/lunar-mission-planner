"""Lunar South Pole Mission Planner API.

Run from the repository root:  uvicorn Backend.app.main:app --reload
Interactive docs:              http://localhost:8000/docs
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import science
from .schemas import Horizon, Position, Site, Timeline
from .sites import SITES

MAX_TIMELINE_SAMPLES = 5000

app = FastAPI(title="Lunar South Pole Mission Planner API", version="0.1.0")

# Open CORS so the React dev server (any localhost port) can call the API.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def _site(site_id: str) -> dict:
    if site_id not in SITES:
        raise HTTPException(404, f"Unknown site '{site_id}'. See /sites for valid ids.")
    return SITES[site_id]


def _utc(value: datetime) -> datetime:
    """Treat times without an offset as UTC, per the project convention."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def _state(site: dict, profile: dict, time: datetime) -> dict:
    """Sun/Earth angles plus terrain-aware visibility for one site and time."""
    raw = science.sun_earth_positions(
        time,
        site["latitude_deg"],
        site["longitude_deg"],
        site["elevation_km"],
        site["id"],
    )
    result = {}
    for body in ("sun", "earth"):
        horizon = science.horizon_at(profile, raw[body]["azimuth_deg"])
        result[body] = {
            **raw[body],
            "horizon_elevation_deg": horizon,
            "visible": science.is_visible(raw[body]["elevation_deg"], horizon),
        }
    result["both_visible"] = result["sun"]["visible"] and result["earth"]["visible"]
    return result


def _windows(times: list[str], visible: list[bool], range_end: str) -> list[dict]:
    windows = []
    start = None
    for time, flag in zip(times, visible):
        if flag and start is None:
            start = time
        elif not flag and start is not None:
            windows.append({"start": start, "end": time})
            start = None
    if start is not None:
        windows.append({"start": start, "end": range_end})
    return windows


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_source": science.TERRAIN_SOURCE,
    }


@app.get("/sites", response_model=list[Site])
def list_sites():
    return list(SITES.values())


@app.get("/sites/{site_id}/horizon", response_model=Horizon)
def get_horizon(site_id: str):
    site = _site(site_id)
    profile = science.horizon_profile(site_id, site["latitude_deg"], site["longitude_deg"])
    return {"site_id": site_id, "terrain_source": science.TERRAIN_SOURCE, **profile}


@app.get("/sites/{site_id}/position", response_model=Position)
def get_position(
    site_id: str,
    time: datetime = Query(description="UTC ISO 8601, e.g. 2028-11-20T12:00:00Z"),
):
    site = _site(site_id)
    profile = science.horizon_profile(site_id, site["latitude_deg"], site["longitude_deg"])
    when = _utc(time)
    return {
        "site_id": site_id,
        "time": _iso(when),
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_source": science.TERRAIN_SOURCE,
        **_state(site, profile, when),
    }


@app.get("/sites/{site_id}/timeline", response_model=Timeline)
def get_timeline(
    site_id: str,
    start: datetime = Query(description="UTC ISO 8601, e.g. 2028-11-20T00:00:00Z"),
    end: datetime = Query(description="UTC ISO 8601, after start"),
    step_minutes: int = Query(60, ge=1, description="Spacing between samples"),
):
    site = _site(site_id)
    first, last = _utc(start), _utc(end)
    if last <= first:
        raise HTTPException(400, "end must be after start.")
    step = timedelta(minutes=step_minutes)
    count = int((last - first) / step) + 1
    if count > MAX_TIMELINE_SAMPLES:
        raise HTTPException(
            400,
            f"Range needs {count} samples; the limit is {MAX_TIMELINE_SAMPLES}. "
            "Use a larger step_minutes or a shorter range.",
        )

    profile = science.horizon_profile(site_id, site["latitude_deg"], site["longitude_deg"])
    times = [first + i * step for i in range(count)]
    states = [_state(site, profile, t) for t in times]
    iso_times = [_iso(t) for t in times]

    def series(body: str) -> dict:
        return {
            "azimuth_deg": [s[body]["azimuth_deg"] for s in states],
            "elevation_deg": [s[body]["elevation_deg"] for s in states],
            "visible": [s[body]["visible"] for s in states],
        }

    sun, earth = series("sun"), series("earth")
    both = [s["both_visible"] for s in states]
    range_end = _iso(last)
    return {
        "site_id": site_id,
        "start": iso_times[0],
        "end": range_end,
        "step_minutes": step_minutes,
        "ephemeris_source": science.EPHEMERIS_SOURCE,
        "terrain_source": science.TERRAIN_SOURCE,
        "samples": {"time": iso_times, "sun": sun, "earth": earth, "both_visible": both},
        "windows": {
            "sun": _windows(iso_times, sun["visible"], range_end),
            "earth": _windows(iso_times, earth["visible"], range_end),
            "both": _windows(iso_times, both, range_end),
        },
    }
