"""The one place where the backend touches the science code and data.

Sun/Earth geometry, visibility, windows and comparison: Madhav's SPICE
pipeline (Science/science_pipeline.py).

Terrain: Arnav's processed files, data/processed/{site_id}_terrain.json.
A site without a real file falls back to a placeholder horizon, and every
response says which was used ("lola" or "placeholder"). Files are read once;
restart the server after adding or replacing one.
"""

from __future__ import annotations

import json
import os
import threading
from functools import lru_cache
from pathlib import Path

from Science.ephemeris.sun_earth_positions import load_kernels, sun_earth_positions
from Science.science_pipeline import run_site_analysis, run_site_comparison
from Science.visibility.terrain_visibility import compare_sun_earth

from . import placeholders
from .sites import REPO_ROOT, SITES

KERNELS_DIR = Path(os.environ.get("LUNAR_KERNELS_DIR", REPO_ROOT / "kernels"))
KERNEL_SUFFIXES = {".bsp", ".bpc", ".tf", ".tls", ".tpc"}
TERRAIN_DIR = REPO_ROOT / "data" / "processed"

# The status Arnav's pipeline writes for output computed from real GeoTIFFs.
# Anything else (synthetic fixtures, schema examples) is never used as terrain.
REAL_TERRAIN_STATUS = "geotiff_calculated_pending_validation"

EPHEMERIS_SOURCE = "spice"

load_kernels(sorted(p for p in KERNELS_DIR.iterdir() if p.suffix.lower() in KERNEL_SUFFIXES))

# SPICE keeps global state and is not thread-safe, and FastAPI serves
# requests from a thread pool, so only one science call may run at a time.
_spice_lock = threading.Lock()


class IncompleteTerrain(Exception):
    """The site's real horizon has unknown bins, so visibility cannot be decided."""


@lru_cache
def terrain(site_id: str) -> dict | None:
    """Arnav's terrain JSON for a site, or None if no real file exists."""
    path = TERRAIN_DIR / f"{site_id}_terrain.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if data.get("status") == REAL_TERRAIN_STATUS else None


def terrain_source(site_id: str) -> str:
    return "lola" if terrain(site_id) else "placeholder"


@lru_cache
def site_input(site_id: str) -> dict:
    """Build the site dictionary the science pipeline expects."""
    site = SITES[site_id]
    data = terrain(site_id)
    if data is None:
        horizon = placeholders.horizon_profile(site_id)
        elevation_km = 0.0
    else:
        rows = sorted(data["terrain_horizon"], key=lambda row: row["azimuth_deg"])
        # An unknown bin is not a clear sky: refuse rather than guess.
        if any(row["elevation_deg"] is None for row in rows):
            raise IncompleteTerrain(
                f"Terrain horizon for '{site_id}' has azimuths with no data, "
                "so visibility cannot be calculated."
            )
        horizon = {
            "horizon_azimuths": [row["azimuth_deg"] for row in rows],
            "horizon_elevations": [row["elevation_deg"] for row in rows],
        }
        # The horizon was computed from the observer's eye height, so the
        # Sun/Earth angles must be computed from the same point.
        elevation_km = (data["elevation_m"] + data["observer_height_m"]) / 1000.0
    return {
        "site_id": site_id,
        "latitude_deg": site["latitude_deg"],
        "longitude_deg": site["longitude_deg"],
        "elevation_km": elevation_km,
        **horizon,
    }


def position(site_id: str, time: str) -> dict:
    """Sun/Earth angles and terrain-aware visibility at one moment."""
    site = site_input(site_id)
    with _spice_lock:
        positions = sun_earth_positions(
            timestamp=time,
            latitude_deg=site["latitude_deg"],
            longitude_deg=site["longitude_deg"],
            elevation_km=site["elevation_km"],
            site_id=site_id,
        )
    result = compare_sun_earth(positions, site["horizon_azimuths"], site["horizon_elevations"])
    result["both_visible"] = result["sun"]["visible"] and result["earth"]["visible"]
    return result


def analysis(site_id: str, start: str, end: str, step_minutes: int) -> dict:
    site = site_input(site_id)
    with _spice_lock:
        return run_site_analysis(site, start, end, step_minutes)


def comparison(site_ids: list[str], start: str, end: str, step_minutes: int) -> dict:
    sites = [site_input(s) for s in site_ids]
    with _spice_lock:
        return run_site_comparison(sites, start, end, step_minutes)
