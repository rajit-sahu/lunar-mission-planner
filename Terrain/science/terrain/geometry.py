"""Moon-centered spherical geometry in a declared Moon-fixed frame.

Latitudes are planetocentric degrees north; longitudes degrees east.
The sphere is an explicit approximation for line-of-sight calculations,
not a claim that actual lunar topography is spherical.
"""
import numpy as np

MOON_RADIUS_M = 1_737_400.0


def enu_basis(latitude_deg: float, longitude_deg: float):
    """Return local East, North, Up unit vectors in a Moon-fixed Cartesian frame."""
    lat, lon = np.deg2rad([latitude_deg, longitude_deg])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat)*np.cos(lon), -np.sin(lat)*np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)])
    return east, north, up


def great_circle_targets(latitude_deg, longitude_deg, azimuth_deg, arc_distance_m, radius_m=MOON_RADIUS_M):
    """Positions on the reference sphere given initial clockwise-from-north azimuths.

    Azimuth and distance broadcast normally; returns lat, lon and unit vectors.
    """
    east, north, up = enu_basis(latitude_deg, longitude_deg)
    a = np.deg2rad(np.asarray(azimuth_deg, dtype=float))
    central_angle = np.asarray(arc_distance_m, dtype=float) / radius_m
    tangent = np.sin(a)[..., None]*east + np.cos(a)[..., None]*north
    target = np.cos(central_angle)[..., None]*up + np.sin(central_angle)[..., None]*tangent
    lat = np.rad2deg(np.arcsin(np.clip(target[..., 2], -1, 1)))
    lon = np.mod(np.rad2deg(np.arctan2(target[..., 1], target[..., 0])), 360.0)
    return lat, lon, target


def terrain_elevation_angle(latitude_deg, longitude_deg, observer_elevation_m,
                            observer_height_m, target_unit_vectors, target_elevation_m,
                            radius_m=MOON_RADIUS_M):
    """Exact angle to each sample on spherical reference Moon, measured above local tangent.

    Returns elevation angles (deg), including negative angles below tangent.
    """
    east, north, up = enu_basis(latitude_deg, longitude_deg)
    observer = (radius_m + observer_elevation_m + observer_height_m)*up
    target = (radius_m + np.asarray(target_elevation_m)[..., None])*target_unit_vectors
    vector = target - observer
    vertical = np.sum(vector*up, axis=-1)
    horizontal = np.hypot(np.sum(vector*east, axis=-1), np.sum(vector*north, axis=-1))
    return np.rad2deg(np.arctan2(vertical, horizontal))


def visibility(body_elevation_deg, body_azimuth_deg, horizon_deg):
    """Linearly interpolate circular horizon profile and compare against body elevation.

    NaN azimuth bins propagate uncertainty rather than assuming visibility.
    """
    h = np.asarray(horizon_deg, dtype=float)
    if h.shape != (360,):
        raise ValueError("Horizon must contain 360 values ordered by integer azimuth [0, 359]")
    a = float(body_azimuth_deg) % 360.0
    i0 = int(np.floor(a))
    i1 = (i0 + 1) % 360
    if not np.isfinite(h[i0]) or not np.isfinite(h[i1]):
        return None
    terrain = h[i0] + (a - i0)*(h[i1] - h[i0])
    return bool(body_elevation_deg > terrain)
