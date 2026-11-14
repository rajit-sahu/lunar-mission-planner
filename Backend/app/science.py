"""The one place where the backend touches the science code.

Sun/Earth geometry, visibility, windows and comparison are Madhav's real
SPICE pipeline (Science/science_pipeline.py). The terrain horizon is still a
placeholder until Arnav's code lands: to swap it, point horizon_profile at
his function and set TERRAIN_SOURCE = "lola".
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

from Science.ephemeris.sun_earth_positions import load_kernels, sun_earth_positions
from Science.science_pipeline import run_site_analysis, run_site_comparison
from Science.visibility.terrain_visibility import compare_sun_earth

from . import placeholders
from .sites import SITES

REPO_ROOT = Path(__file__).resolve().parents[2]
KERNELS_DIR = Path(os.environ.get("LUNAR_KERNELS_DIR", REPO_ROOT / "kernels"))
KERNEL_SUFFIXES = {".bsp", ".bpc", ".tf", ".tls", ".tpc"}

EPHEMERIS_SOURCE = "spice"
TERRAIN_SOURCE = "placeholder"

horizon_profile = placeholders.horizon_profile

load_kernels(sorted(p for p in KERNELS_DIR.iterdir() if p.suffix.lower() in KERNEL_SUFFIXES))

# SPICE keeps global state and is not thread-safe, and FastAPI serves
# requests from a thread pool, so only one science call may run at a time.
_spice_lock = threading.Lock()


def site_input(site_id: str) -> dict:
    """Build the site dictionary the science pipeline expects."""
    site = SITES[site_id]
    return {
        "site_id": site_id,
        "latitude_deg": site["latitude_deg"],
        "longitude_deg": site["longitude_deg"],
        "elevation_km": site["elevation_km"],
        **horizon_profile(site_id, site["latitude_deg"], site["longitude_deg"]),
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
    with _spice_lock:
        return run_site_analysis(site_input(site_id), start, end, step_minutes)


def comparison(site_ids: list[str], start: str, end: str, step_minutes: int) -> dict:
    with _spice_lock:
        return run_site_comparison([site_input(s) for s in site_ids], start, end, step_minutes)
