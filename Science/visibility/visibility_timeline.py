from datetime import datetime, timedelta, timezone

from Science.ephemeris.sun_earth_positions import sun_earth_positions
from Science.visibility.terrain_visibility import compare_sun_earth


def parse_utc(timestamp):
    """Convert ISO UTC timestamp into a timezone-aware datetime."""
    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    if dt.utcoffset() != timedelta(0):
        raise ValueError("Timestamp must be UTC.")

    return dt.astimezone(timezone.utc)


def format_utc(dt):
    """Convert datetime into ISO UTC timestamp."""
    return dt.isoformat().replace("+00:00", "Z")


def generate_visibility_timeline(
    start_time,
    end_time,
    step_minutes,
    latitude_deg,
    longitude_deg,
    horizon_azimuths,
    horizon_elevations,
    site_id="test_site",
    site_elevation_km=0.0,
    thresholds=None
):
    """
    Generate Sun/Earth visibility data over a specified time interval.

    thresholds: optional {"sun": deg, "earth": deg}; see visibility_thresholds().

    SPICE kernels must already be loaded.
    """

    start = parse_utc(start_time)
    end = parse_utc(end_time)

    if end <= start:
        raise ValueError("End time must be after start time.")

    if step_minutes <= 0:
        raise ValueError("Step size must be positive.")

    step = timedelta(minutes=step_minutes)

    timeline = []
    current_time = start

    while current_time <= end:

        timestamp = format_utc(current_time)

        # Calculate Sun and Earth positions
        positions = sun_earth_positions(
            timestamp=timestamp,
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            site_id=site_id,
            elevation_km=site_elevation_km
        )

        # Compare positions with terrain horizon
        visibility = compare_sun_earth(
            positions,
            horizon_azimuths,
            horizon_elevations,
            thresholds
        )

        sun_visible = visibility["sun"]["visible"]
        earth_visible = visibility["earth"]["visible"]

        timeline.append({
            "time": timestamp,

            "sun_azimuth_deg": visibility["sun"]["azimuth_deg"],
            "sun_elevation_deg": visibility["sun"]["elevation_deg"],
            "sun_horizon_deg": visibility["sun"]["terrain_horizon_deg"],
            "sun_clearance_deg": visibility["sun"]["clearance_deg"],
            "sun_disc_fraction": visibility["sun"]["disc_fraction"],
            "sun_distance_km": visibility["sun"]["distance_km"],
            "sun_eclipse_clearance_deg": visibility["sun"]["eclipse_clearance_deg"],
            "sun_eclipsed_fraction": visibility["sun"]["eclipsed_fraction"],

            "earth_azimuth_deg": visibility["earth"]["azimuth_deg"],
            "earth_elevation_deg": visibility["earth"]["elevation_deg"],
            "earth_horizon_deg": visibility["earth"]["terrain_horizon_deg"],
            "earth_clearance_deg": visibility["earth"]["clearance_deg"],
            "earth_disc_fraction": visibility["earth"]["disc_fraction"],

            "sun_visible": sun_visible,
            "earth_visible": earth_visible,
            "both_visible": sun_visible and earth_visible
        })

        current_time += step

    return {
        "site_id": site_id,
        "start_time": start_time,
        "end_time": end_time,
        "step_minutes": step_minutes,
        "timeline": timeline
    }