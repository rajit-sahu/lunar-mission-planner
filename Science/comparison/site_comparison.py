from Science.visibility.visibility_timeline import generate_visibility_timeline
from Science.visibility.visibility_windows import (
    find_visibility_windows,
    calculate_window_statistics
)


def analyse_site(
    site,
    start_time,
    end_time,
    step_minutes=15,
    thresholds=None
):
    """
    Run the complete visibility analysis for one lunar site.

    SPICE kernels must already be loaded.

    site must contain:
        site_id
        latitude_deg
        longitude_deg
        horizon_azimuths
        horizon_elevations

    Optional:
        elevation_km
    """

    site_id = site["site_id"]
    latitude = site["latitude_deg"]
    longitude = site["longitude_deg"]
    elevation = site.get("elevation_km", 0.0)

    horizon_azimuths = site["horizon_azimuths"]
    horizon_elevations = site["horizon_elevations"]

    timeline_result = generate_visibility_timeline(
        start_time=start_time,
        end_time=end_time,
        step_minutes=step_minutes,
        latitude_deg=latitude,
        longitude_deg=longitude,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations,
        site_id=site_id,
        site_elevation_km=elevation,
        thresholds=thresholds
    )

    windows_result = find_visibility_windows(
        timeline_result=timeline_result,
        latitude_deg=latitude,
        longitude_deg=longitude,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations,
        site_id=site_id,
        site_elevation_km=elevation,
        thresholds=thresholds
    )

    statistics = calculate_window_statistics(windows_result)

    return {
        "site_id": site_id,
        "coordinates": {
            "latitude_deg": latitude,
            "longitude_deg": longitude,
            "elevation_km": elevation
        },
        "timeline": timeline_result["timeline"],
        "windows": windows_result["windows"],
        "statistics": statistics,
        "thresholds_deg": thresholds or {"sun": 0.0, "earth": 0.0}
    }


def compare_sites(
    sites,
    start_time,
    end_time,
    step_minutes=15,
    thresholds=None
):
    """
    Analyse multiple lunar sites over the same time interval.

    Returns complete site analyses and a compact comparison table.
    """

    if not sites:
        raise ValueError("At least one site must be provided.")

    analyses = []
    comparison = []

    for site in sites:

        result = analyse_site(
            site=site,
            start_time=start_time,
            end_time=end_time,
            step_minutes=step_minutes,
            thresholds=thresholds
        )

        analyses.append(result)

        stats = result["statistics"]

        comparison.append({
            "site_id": result["site_id"],
            "sun_visible_percent": stats["sun"]["visible_percent"],
            "earth_visible_percent": stats["earth"]["visible_percent"],
            "both_visible_percent": stats["both"]["visible_percent"],
            "longest_darkness_hours":
                stats["sun"]["longest_not_visible_hours"],
            "longest_earth_outage_hours":
                stats["earth"]["longest_not_visible_hours"],
            "longest_simultaneous_visibility_hours":
                stats["both"]["longest_visible_hours"]
        })

    return {
        "start_time": start_time,
        "end_time": end_time,
        "step_minutes": step_minutes,
        "comparison": comparison,
        "sites": analyses
    }