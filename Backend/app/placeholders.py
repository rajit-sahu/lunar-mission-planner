"""Placeholder science functions. NOT real lunar geometry.

These return made-up but plausible, smoothly varying numbers so the API and
frontend can be built before the real science code is merged. Each function
mirrors the signature and return shape of the real one it stands in for:

- sun_earth_positions -> Madhav, Science/ephemeris/sun_earth_positions.py
- horizon_profile     -> Arnav, terrain horizon (file name not decided yet)

science.py decides whether the real or placeholder version is used.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

J2000 = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
SYNODIC_MONTH_DAYS = 29.530589
DRACONIC_YEAR_DAYS = 346.62
LIBRATION_LAT_DAYS = 27.2122
LIBRATION_LON_DAYS = 27.5546


def _days_since_j2000(timestamp: str | datetime) -> tuple[float, str]:
    if isinstance(timestamp, str):
        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("Timestamp must specify a UTC offset or 'Z'.")
    utc = timestamp.astimezone(timezone.utc)
    iso = utc.isoformat(timespec="seconds").replace("+00:00", "Z")
    return (utc - J2000).total_seconds() / 86400.0, iso


def sun_earth_positions(
    timestamp: str | datetime,
    latitude_deg: float,
    longitude_deg: float,
    elevation_km: float = 0.0,
    site_id: str | None = None,
) -> dict:
    """Fake Sun/Earth angles with the same output shape as the real module."""
    days, iso = _days_since_j2000(timestamp)
    colatitude = 90.0 - abs(latitude_deg)
    lon = math.radians(longitude_deg)

    # Sun circles the horizon once per lunar day, a few degrees up or down.
    hour_angle = 2 * math.pi * days / SYNODIC_MONTH_DAYS + lon
    sun_az = math.degrees(-hour_angle) % 360.0
    sun_el = colatitude * math.cos(hour_angle) + 1.54 * math.sin(
        2 * math.pi * days / DRACONIC_YEAR_DAYS
    )

    # Earth stays near one direction and wobbles with libration.
    earth_az = (-longitude_deg + 7.9 * math.sin(2 * math.pi * days / LIBRATION_LON_DAYS)) % 360.0
    earth_el = colatitude * math.cos(lon) + 6.7 * math.sin(
        2 * math.pi * days / LIBRATION_LAT_DAYS
    )

    return {
        "site_id": site_id,
        "time": iso,
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "site_elevation_km": elevation_km,
        "frame": "MOON_ME",
        "geometry": "placeholder",
        "sun": {"azimuth_deg": sun_az, "elevation_deg": sun_el, "distance_km": 1.496e8},
        "earth": {"azimuth_deg": earth_az, "elevation_deg": earth_el, "distance_km": 384400.0},
    }


def horizon_profile(site_id: str, latitude_deg: float, longitude_deg: float) -> dict:
    """Fake 360-degree terrain horizon: elevation angle at each whole azimuth."""
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
    return {"azimuth_deg": azimuths, "horizon_elevation_deg": elevations}
