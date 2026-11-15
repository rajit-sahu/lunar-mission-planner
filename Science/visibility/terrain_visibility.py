import numpy as np


def interpolate_horizon(azimuth_deg, horizon_azimuths, horizon_elevations):
    """
    Interpolate terrain horizon elevation at a given azimuth.

    All angles are in degrees.
    Azimuth is clockwise from north.
    """

    azimuths = np.asarray(horizon_azimuths, dtype=float)
    elevations = np.asarray(horizon_elevations, dtype=float)

    if azimuths.ndim != 1 or elevations.ndim != 1:
        raise ValueError("Horizon arrays must be one-dimensional.")

    if len(azimuths) != len(elevations) or len(azimuths) < 2:
        raise ValueError("Horizon arrays must have equal lengths >= 2.")

    if not np.all(np.isfinite(azimuths)) or not np.all(np.isfinite(elevations)):
        raise ValueError("Horizon arrays must contain finite values.")

    # Convert all azimuths into [0, 360)
    azimuths = azimuths % 360.0

    # Sort samples by azimuth
    order = np.argsort(azimuths)
    azimuths = azimuths[order]
    elevations = elevations[order]

    if np.any(np.diff(azimuths) == 0):
        raise ValueError("Duplicate horizon azimuths are not allowed.")

    # Extend the horizon profile to handle the 360° -> 0° boundary
    extended_azimuths = np.concatenate(
        ([azimuths[-1] - 360], azimuths, [azimuths[0] + 360])
    )

    extended_elevations = np.concatenate(
        ([elevations[-1]], elevations, [elevations[0]])
    )

    return float(
        np.interp(
            azimuth_deg % 360.0,
            extended_azimuths,
            extended_elevations
        )
    )


SUN_RADIUS_KM = 695_700.0
EARTH_RADIUS_KM = 6_371.0
BODY_RADIUS_KM = {"sun": SUN_RADIUS_KM, "earth": EARTH_RADIUS_KM}

# Mean angular radii seen from the Moon, for building thresholds.
SUN_ANGULAR_RADIUS_DEG = 0.2666
EARTH_ANGULAR_RADIUS_DEG = 0.95

# What counts as "the Sun is visible": its top edge, its centre, or its whole disc.
SUN_CRITERIA = {"limb": -SUN_ANGULAR_RADIUS_DEG, "centre": 0.0, "full": SUN_ANGULAR_RADIUS_DEG}


def visibility_thresholds(sun_criterion="centre", earth_margin_deg=0.0):
    """Clearance (deg) each body must exceed to count as visible.

    sun_criterion: "limb" (any part of the disc above terrain), "centre", or
    "full" (whole disc above terrain).
    earth_margin_deg: how far Earth's centre must clear the terrain, e.g. a
    link margin for direct-to-Earth radio.
    """
    if sun_criterion not in SUN_CRITERIA:
        raise ValueError(f"sun_criterion must be one of {sorted(SUN_CRITERIA)}.")
    if not 0.0 <= earth_margin_deg <= 20.0:
        raise ValueError("earth_margin_deg must be between 0 and 20.")
    return {"sun": SUN_CRITERIA[sun_criterion], "earth": float(earth_margin_deg)}


def angular_radius_deg(body, distance_km):
    """Apparent angular radius of the Sun or Earth at a given distance."""
    return float(np.degrees(np.arcsin(BODY_RADIUS_KM[body] / distance_km)))


def disc_fraction(clearance_deg, radius_deg):
    """Fraction of a disc above a straight horizon, given its centre's clearance.

    Exact circle-segment area; the horizon is treated as locally straight
    across the disc (fine for discs well under 2 degrees).
    """
    d, r = float(clearance_deg), float(radius_deg)
    if d >= r:
        return 1.0
    if d <= -r:
        return 0.0
    area = r * r * np.arccos(-d / r) + d * np.sqrt(r * r - d * d)
    return float(area / (np.pi * r * r))


def check_visibility(body_azimuth, body_elevation,
                     horizon_azimuths, horizon_elevations,
                     threshold_deg=0.0):
    """
    Compare a celestial body against the terrain horizon.

    Visible means clearance (body elevation minus terrain elevation at the
    body's azimuth) is greater than threshold_deg; 0 tests the body's centre.
    """

    terrain_elevation = interpolate_horizon(
        body_azimuth,
        horizon_azimuths,
        horizon_elevations
    )

    clearance = body_elevation - terrain_elevation

    return {
        "visible": bool(clearance > threshold_deg),
        "terrain_horizon_deg": terrain_elevation,
        "clearance_deg": float(clearance)
    }


def compare_sun_earth(positions, horizon_azimuths, horizon_elevations,
                      thresholds=None):
    """
    Compare Sun and Earth positions against a shared terrain horizon.

    positions: output dictionary from sun_earth_positions()
    thresholds: optional {"sun": deg, "earth": deg} from visibility_thresholds()
    """

    thresholds = thresholds or {"sun": 0.0, "earth": 0.0}

    result = {
        "site_id": positions["site_id"],
        "time": positions["time"]
    }

    for body in ("sun", "earth"):

        body_data = positions[body]

        visibility = check_visibility(
            body_data["azimuth_deg"],
            body_data["elevation_deg"],
            horizon_azimuths,
            horizon_elevations,
            threshold_deg=thresholds[body]
        )

        radius = angular_radius_deg(body, body_data["distance_km"])

        result[body] = {
            **body_data,
            **visibility,
            "angular_radius_deg": radius,
            "disc_fraction": disc_fraction(visibility["clearance_deg"], radius),
        }

    return result
