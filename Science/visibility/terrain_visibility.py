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


def check_visibility(body_azimuth, body_elevation,
                     horizon_azimuths, horizon_elevations):
    """
    Compare a celestial body's centre against the terrain horizon.
    """

    terrain_elevation = interpolate_horizon(
        body_azimuth,
        horizon_azimuths,
        horizon_elevations
    )

    clearance = body_elevation - terrain_elevation

    return {
        "visible": bool(clearance > 0),
        "terrain_horizon_deg": terrain_elevation,
        "clearance_deg": float(clearance)
    }


def compare_sun_earth(positions, horizon_azimuths, horizon_elevations):
    """
    Compare Sun and Earth positions against a shared terrain horizon.

    positions: output dictionary from sun_earth_positions()
    """

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
            horizon_elevations
        )

        result[body] = {
            **body_data,
            **visibility
        }

    return result