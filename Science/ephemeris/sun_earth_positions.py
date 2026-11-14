"""Sun/Earth positions for the Lunar South Pole Mission Planner.

Suggested repository location: science/ephemeris/sun_earth_positions.py

Dependencies: numpy, spiceypy

This module calculates *geometric* (uncorrected for light-time/aberration)
Sun/Earth azimuth and elevation from a specified lunar surface site.
It does not load SPICE kernels automatically: call load_kernels() with a
compatible planetary SPK, lunar orientation PCK/FK and leap-seconds LSK.

Conventions:
- Latitude: degrees, north positive; longitude: degrees, east positive.
- Moon-fixed frame: MOON_ME (requires appropriate lunar frame kernels).
- Azimuth: degrees clockwise from local north, [0, 360).
- Elevation: degrees above the spherical local horizontal plane.
- Distances: kilometres; timestamps: UTC ISO 8601.
- Site elevation: kilometres above the spherical reference radius.

The local Up direction is radial (spherical approximation). Arnav's terrain
horizon must use the same observer position, local horizon and azimuth convention.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import spiceypy as spice

MOON_RADIUS_KM = 1737.4  # Mean reference radius; confirm DEM vertical datum.
MOON_FRAME = "MOON_ME"


def load_kernels(paths: Iterable[str | Path]) -> None:
    """Load the compatible SPICE kernels supplied by the caller."""
    for path in paths:
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(f"SPICE kernel not found: {path}")
        spice.furnsh(str(path))


def clear_kernels() -> None:
    """Unload all SPICE kernels (useful after a run or in tests)."""
    spice.kclear()


def site_position_km(
    latitude_deg: float,
    longitude_deg: float,
    elevation_km: float = 0.0,
    radius_km: float = MOON_RADIUS_KM,
) -> np.ndarray:
    """Return spherical Moon-fixed Cartesian position of a surface site."""
    if not -90 <= latitude_deg <= 90:
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if radius_km + elevation_km <= 0:
        raise ValueError("Site radial distance must be positive.")
    lat, lon = np.deg2rad([latitude_deg, longitude_deg])
    return (radius_km + elevation_km) * np.array(
        [np.cos(lat) * np.cos(lon),
         np.cos(lat) * np.sin(lon),
         np.sin(lat)],
        dtype=float,
    )


def local_enu_basis(latitude_deg: float, longitude_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return East, North and radial Up unit vectors in Moon-fixed coordinates.

    Azimuth is undefined exactly at the geographic poles, so reject them.
    """
    if not -90 < latitude_deg < 90:
        raise ValueError("Azimuth is undefined at the geographic poles; choose a non-polar site.")
    lat, lon = np.deg2rad([latitude_deg, longitude_deg])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon),
                      -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon),
                   np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def azimuth_elevation_deg(
    site_to_body_km: np.ndarray, latitude_deg: float, longitude_deg: float
) -> tuple[float, float]:
    """Convert a Moon-fixed site-to-body vector to local azimuth/elevation."""
    vector = np.asarray(site_to_body_km, dtype=float)
    if vector.shape != (3,) or not np.all(np.isfinite(vector)) or np.linalg.norm(vector) == 0:
        raise ValueError("site_to_body_km must be a finite, nonzero 3-vector.")
    east, north, up = local_enu_basis(latitude_deg, longitude_deg)
    e, n, u = (float(np.dot(vector, axis)) for axis in (east, north, up))
    azimuth = float(np.degrees(np.arctan2(e, n)) % 360.0)
    elevation = float(np.degrees(np.arctan2(u, np.hypot(e, n))))
    return azimuth, elevation


def _utc_iso(timestamp: str | datetime) -> str:
    """Normalize an ISO timestamp to explicit UTC (reject naive datetimes)."""
    if isinstance(timestamp, str):
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    elif isinstance(timestamp, datetime):
        dt = timestamp
    else:
        raise TypeError("timestamp must be an ISO 8601 string or datetime")
    if dt.tzinfo is None:
        raise ValueError("Timestamp must specify a UTC offset or 'Z'.")
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def body_angles(
    body: str,
    timestamp: str | datetime,
    latitude_deg: float,
    longitude_deg: float,
    elevation_km: float = 0.0,
    radius_km: float = MOON_RADIUS_KM,
    frame: str = MOON_FRAME,
) -> dict:
    """Return geometric Sun/Earth direction from a lunar surface location.

    Requires loaded SPICE kernels. 'NONE' keeps the body and site positions
    at the same ephemeris time; do not interpret as apparent observed angles.
    """
    body = body.upper()
    if body not in {"SUN", "EARTH"}:
        raise ValueError("body must be 'SUN' or 'EARTH'.")
    utc = _utc_iso(timestamp)
    et = spice.str2et(utc)
    body_from_moon, _ = spice.spkpos(body, et, frame, "NONE", "MOON")
    site_from_moon = site_position_km(latitude_deg, longitude_deg, elevation_km, radius_km)
    site_to_body = np.asarray(body_from_moon, dtype=float) - site_from_moon
    azimuth, elevation = azimuth_elevation_deg(site_to_body, latitude_deg, longitude_deg)
    return {
        "azimuth_deg": azimuth,
        "elevation_deg": elevation,
        "distance_km": float(np.linalg.norm(site_to_body)),
    }


def sun_earth_positions(
    timestamp: str | datetime,
    latitude_deg: float,
    longitude_deg: float,
    elevation_km: float = 0.0,
    site_id: str | None = None,
    radius_km: float = MOON_RADIUS_KM,
) -> dict:
    """Compute JSON-ready Sun/Earth geometry for a site and UTC time."""
    utc = _utc_iso(timestamp)
    return {
        "site_id": site_id,
        "time": utc,
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "site_elevation_km": elevation_km,
        "frame": MOON_FRAME,
        "geometry": "geometric",
        "sun": body_angles("SUN", utc, latitude_deg, longitude_deg, elevation_km, radius_km),
        "earth": body_angles("EARTH", utc, latitude_deg, longitude_deg, elevation_km, radius_km),
    }


if __name__ == "__main__":
    print("Import this module and load SPICE kernels before calling sun_earth_positions().")
    print("Example:")
    print("  load_kernels(['/path/to/leapseconds.tls', '/path/to/planetary.bsp',")
    print("                '/path/to/lunar_orientation.bpc', '/path/to/lunar_frames.tf'])")
    print("  result = sun_earth_positions('2028-11-20T12:00:00Z', -85.0, 30.0)")
    print("  print(result)")
