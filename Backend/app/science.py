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
from Science.visibility.terrain_visibility import compare_sun_earth, visibility_thresholds

from . import placeholders
from .sites import REPO_ROOT, SITES

KERNELS_DIR = Path(os.environ.get("LUNAR_KERNELS_DIR", REPO_ROOT / "kernels"))
KERNEL_SUFFIXES = {".bsp", ".bpc", ".tf", ".tls", ".tpc"}
TERRAIN_DIR = REPO_ROOT / "data" / "processed"

# The status Arnav's pipeline writes for output computed from real GeoTIFFs.
# Anything else (synthetic fixtures, schema examples) is never used as terrain.
REAL_TERRAIN_STATUS = "geotiff_calculated_pending_validation"

EPHEMERIS_SOURCE = "spice"

# Observer heights with precomputed horizons. 2 m is the default (lander deck);
# taller masts see past nearby ridges. Files: {site}_terrain.json for 2 m,
# {site}_terrain_h{N}.json for the others.
OBSERVER_HEIGHTS_M = (2, 5, 10)
DEFAULT_HEIGHT_M = 2

load_kernels(sorted(p for p in KERNELS_DIR.iterdir() if p.suffix.lower() in KERNEL_SUFFIXES))

# SPICE keeps global state and is not thread-safe, and FastAPI serves
# requests from a thread pool, so only one science call may run at a time.
_spice_lock = threading.Lock()


class IncompleteTerrain(Exception):
    """The site's real horizon has unknown bins, so visibility cannot be decided."""


class MissingHeight(Exception):
    """No precomputed horizon exists for the requested observer height."""


def _terrain_path(site_id: str, height_m: int) -> Path:
    suffix = "" if height_m == DEFAULT_HEIGHT_M else f"_h{height_m}"
    return TERRAIN_DIR / f"{site_id}_terrain{suffix}.json"


@lru_cache
def terrain(site_id: str, height_m: int = DEFAULT_HEIGHT_M) -> dict | None:
    """Arnav's terrain JSON for a site and observer height, or None if no real file exists."""
    path = _terrain_path(site_id, height_m)
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if data.get("status") == REAL_TERRAIN_STATUS else None


def available_heights(site_id: str) -> list[int]:
    return [h for h in OBSERVER_HEIGHTS_M if terrain(site_id, h)]


def terrain_source(site_id: str, height_m: int = DEFAULT_HEIGHT_M) -> str:
    return "lola" if terrain(site_id, height_m) else "placeholder"


@lru_cache
def site_input(site_id: str, height_m: int = DEFAULT_HEIGHT_M) -> dict:
    """Build the site dictionary the science pipeline expects."""
    site = SITES[site_id]
    data = terrain(site_id, height_m)
    if data is None:
        if height_m != DEFAULT_HEIGHT_M:
            raise MissingHeight(f"No {height_m} m horizon for '{site_id}'. Available: {available_heights(site_id)}.")
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
        # Terrain files may carry a refined representative point (e.g. moved
        # onto a crest); use it so the angles match the horizon's observer.
        "latitude_deg": (data or {}).get("latitude_deg", site["latitude_deg"]),
        "longitude_deg": (data or {}).get("longitude_deg", site["longitude_deg"]),
        "elevation_km": elevation_km,
        **horizon,
    }


def position(site_id: str, time: str, height_m: int = DEFAULT_HEIGHT_M, thresholds: dict | None = None) -> dict:
    """Sun/Earth angles and terrain-aware visibility at one moment."""
    site = site_input(site_id, height_m)
    with _spice_lock:
        positions = sun_earth_positions(
            timestamp=time,
            latitude_deg=site["latitude_deg"],
            longitude_deg=site["longitude_deg"],
            elevation_km=site["elevation_km"],
            site_id=site_id,
        )
    result = compare_sun_earth(positions, site["horizon_azimuths"], site["horizon_elevations"], thresholds)
    result["both_visible"] = result["sun"]["visible"] and result["earth"]["visible"]
    return result


def analysis(site_id: str, start: str, end: str, step_minutes: int,
             height_m: int = DEFAULT_HEIGHT_M, thresholds: dict | None = None) -> dict:
    site = site_input(site_id, height_m)
    with _spice_lock:
        return run_site_analysis(site, start, end, step_minutes, thresholds)


def comparison(site_ids: list[str], start: str, end: str, step_minutes: int,
               height_m: int = DEFAULT_HEIGHT_M, thresholds: dict | None = None) -> dict:
    sites = [site_input(s, height_m) for s in site_ids]
    with _spice_lock:
        return run_site_comparison(sites, start, end, step_minutes, thresholds)


__all__ = ["visibility_thresholds"]
