"""The one place where the backend touches the science code.

Everything else in the backend imports from here, so swapping a placeholder
for the real implementation only ever means editing this file.

Sun/Earth positions: uses Madhav's real module when LUNAR_KERNELS_DIR points
at a folder of SPICE kernels (.bsp, .bpc, .tf, .tls, .tpc); otherwise uses the
placeholder. Terrain horizon: placeholder until Arnav's code lands.
"""

from __future__ import annotations

import os
from pathlib import Path

from . import placeholders

KERNEL_SUFFIXES = {".bsp", ".bpc", ".tf", ".tls", ".tpc"}

EPHEMERIS_SOURCE = "placeholder"
TERRAIN_SOURCE = "placeholder"

sun_earth_positions = placeholders.sun_earth_positions
horizon_profile = placeholders.horizon_profile

_kernels_dir = os.environ.get("LUNAR_KERNELS_DIR")
if _kernels_dir:
    # Fails loudly on purpose: if kernels were asked for, never fall back silently.
    from Science.ephemeris import sun_earth_positions as _real

    _real.load_kernels(
        sorted(p for p in Path(_kernels_dir).iterdir() if p.suffix.lower() in KERNEL_SUFFIXES)
    )
    sun_earth_positions = _real.sun_earth_positions
    EPHEMERIS_SOURCE = "spice"


def horizon_at(profile: dict, azimuth_deg: float) -> float:
    """Terrain horizon elevation at any azimuth, interpolated across 0/360."""
    azimuths = profile["azimuth_deg"]
    elevations = profile["horizon_elevation_deg"]
    n = len(azimuths)
    az = azimuth_deg % 360.0
    # Index of the last sample at or below az; -1 wraps to the final sample.
    i = max((k for k in range(n) if azimuths[k] <= az), default=-1)
    a0, e0 = azimuths[i], elevations[i]
    a1, e1 = azimuths[(i + 1) % n], elevations[(i + 1) % n]
    span = (a1 - a0) % 360.0 or 360.0
    return e0 + (e1 - e0) * (((az - a0) % 360.0) / span)


def is_visible(elevation_deg: float, horizon_elevation_deg: float) -> bool:
    """Point-source visibility: the body is above the terrain at its azimuth."""
    return elevation_deg > horizon_elevation_deg
