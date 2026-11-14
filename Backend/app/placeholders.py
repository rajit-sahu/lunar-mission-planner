"""Placeholder terrain horizon. NOT real lunar terrain.

Returns a made-up but smooth 360-degree horizon so the Sun/Earth pipeline
has something to compare against for sites whose real LOLA terrain file has
not been generated yet. science.py decides when this is used.
"""

from __future__ import annotations

import math


def horizon_profile(site_id: str) -> dict:
    """Fake terrain horizon: elevation angle at each whole azimuth."""
    seed = sum(ord(c) for c in site_id)
    azimuths = list(range(360))
    elevations = []
    for az in azimuths:
        a = math.radians(az)
        bumps = (
            1.2 * math.sin(2 * a + seed)
            + 0.8 * math.sin(5 * a + 2 * seed)
            + 0.4 * math.sin(11 * a + 3 * seed)
        )
        elevations.append(round(max(0.0, 1.5 + bumps), 3))
    return {"horizon_azimuths": azimuths, "horizon_elevations": elevations}
