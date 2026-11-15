"""Shared fixtures for the science tests. Run from the repo root: python -m pytest"""

from pathlib import Path

import pytest

from Science.ephemeris.sun_earth_positions import load_kernels

REPO = Path(__file__).resolve().parents[1]
KERNEL_SUFFIXES = {".bsp", ".bpc", ".tf", ".tls", ".tpc"}


@pytest.fixture(scope="session", autouse=True)
def spice_kernels():
    """Load the SPICE kernels once. Never unload them: the backend shares SPICE's global state."""
    load_kernels(sorted(p for p in (REPO / "kernels").iterdir() if p.suffix.lower() in KERNEL_SUFFIXES))


@pytest.fixture
def flat_site():
    """A site with a flat 1-degree horizon all round (easy to reason about)."""
    return {
        "site_id": "flat",
        "latitude_deg": -85.992,
        "longitude_deg": 2.056,
        "elevation_km": 5.173403,
        "horizon_azimuths": list(range(360)),
        "horizon_elevations": [1.0] * 360,
    }
