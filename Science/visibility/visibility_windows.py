from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.optimize import brentq

from Science.ephemeris.sun_earth_positions import sun_earth_positions
from Science.visibility.terrain_visibility import compare_sun_earth
from Science.visibility.visibility_timeline import (
    parse_utc,
    format_utc
)


def clearance_at_time(
    timestamp,
    body,
    latitude_deg,
    longitude_deg,
    horizon_azimuths,
    horizon_elevations,
    site_id="test_site",
    site_elevation_km=0.0,
    threshold_deg=0.0
):
    """
    Terrain clearance for Sun or Earth at a time, minus the visibility
    threshold, so the function crosses zero exactly at a transition.

    SPICE kernels must already be loaded.
    """

    positions = sun_earth_positions(
        timestamp=timestamp,
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        site_id=site_id,
        elevation_km=site_elevation_km
    )

    visibility = compare_sun_earth(
        positions,
        horizon_azimuths,
        horizon_elevations
    )

    return visibility[body]["clearance_deg"] - threshold_deg


def refine_transition(
    start_time,
    end_time,
    body,
    latitude_deg,
    longitude_deg,
    horizon_azimuths,
    horizon_elevations,
    site_id="test_site",
    site_elevation_km=0.0,
    threshold_deg=0.0
):
    """
    Refine a visibility transition using Brent's root-finding method.

    Returns a UTC timestamp.
    """

    t0 = parse_utc(start_time)
    t1 = parse_utc(end_time)

    duration_seconds = (t1 - t0).total_seconds()

    def clearance_function(seconds):

        current_time = t0 + timedelta(seconds=float(seconds))

        return clearance_at_time(
            timestamp=format_utc(current_time),
            body=body,
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            horizon_azimuths=horizon_azimuths,
            horizon_elevations=horizon_elevations,
            site_id=site_id,
            site_elevation_km=site_elevation_km,
            threshold_deg=threshold_deg
        )

    root_seconds = brentq(
        clearance_function,
        0.0,
        duration_seconds,
        xtol=1.0
    )

    transition_time = t0 + timedelta(seconds=float(root_seconds))

    return format_utc(transition_time)


def find_visibility_windows(
    timeline_result,
    latitude_deg,
    longitude_deg,
    horizon_azimuths,
    horizon_elevations,
    site_id="test_site",
    site_elevation_km=0.0,
    thresholds=None
):
    """
    Find visibility windows for Sun, Earth, and both simultaneously.

    Uses root-finding to refine Sun/Earth transitions. Windows that touch the
    start or end of the range are marked clipped_start / clipped_end: the
    body may have been visible before the range or stay visible after it.
    """

    thresholds = thresholds or {"sun": 0.0, "earth": 0.0}

    timeline = timeline_result["timeline"]

    if len(timeline) < 2:
        raise ValueError("Timeline must contain at least two samples.")

    start_time = timeline[0]["time"]
    end_time = timeline[-1]["time"]

    # Store refined transitions separately for each body.
    transitions = {
        "sun": [],
        "earth": []
    }

    for body in ("sun", "earth"):

        clearance_key = f"{body}_clearance_deg"

        for i in range(len(timeline) - 1):

            row0 = timeline[i]
            row1 = timeline[i + 1]

            c0 = row0[clearance_key] - thresholds[body]
            c1 = row1[clearance_key] - thresholds[body]

            # Check whether clearance crosses the threshold.
            if c0 * c1 < 0:

                transition = refine_transition(
                    start_time=row0["time"],
                    end_time=row1["time"],
                    body=body,
                    latitude_deg=latitude_deg,
                    longitude_deg=longitude_deg,
                    horizon_azimuths=horizon_azimuths,
                    horizon_elevations=horizon_elevations,
                    site_id=site_id,
                    site_elevation_km=site_elevation_km,
                    threshold_deg=thresholds[body]
                )

                transitions[body].append(parse_utc(transition))

            elif c0 == 0:

                # Exactly on the threshold at a sample: that sample is a boundary.
                transitions[body].append(parse_utc(row0["time"]))

            elif c1 == 0:

                transitions[body].append(parse_utc(row1["time"]))

    # Combine start/end and all transition timestamps.
    boundaries = [
        parse_utc(start_time),
        parse_utc(end_time),
        *transitions["sun"],
        *transitions["earth"]
    ]

    boundaries = sorted(set(boundaries))

    windows = {
        "sun": [],
        "earth": [],
        "both": []
    }

    # Evaluate visibility at each interval midpoint.
    for i in range(len(boundaries) - 1):

        t0 = boundaries[i]
        t1 = boundaries[i + 1]

        midpoint = t0 + (t1 - t0) / 2

        positions = sun_earth_positions(
            timestamp=format_utc(midpoint),
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            site_id=site_id,
            elevation_km=site_elevation_km
        )

        visibility = compare_sun_earth(
            positions,
            horizon_azimuths,
            horizon_elevations,
            thresholds
        )

        sun_visible = visibility["sun"]["visible"]
        earth_visible = visibility["earth"]["visible"]

        states = {
            "sun": sun_visible,
            "earth": earth_visible,
            "both": sun_visible and earth_visible
        }

        for key, is_visible in states.items():

            if is_visible:

                # Merge adjacent visible intervals.
                if windows[key] and windows[key][-1]["end"] == format_utc(t0):

                    windows[key][-1]["end"] = format_utc(t1)

                else:

                    windows[key].append({
                        "start": format_utc(t0),
                        "end": format_utc(t1)
                    })

    # Add durations to each window.
    for key in windows:

        for window in windows[key]:

            start = parse_utc(window["start"])
            end = parse_utc(window["end"])

            window["duration_hours"] = (
                end - start
            ).total_seconds() / 3600.0
            window["clipped_start"] = window["start"] == format_utc(boundaries[0])
            window["clipped_end"] = window["end"] == format_utc(boundaries[-1])

    return {
        "site_id": site_id,
        "start_time": start_time,
        "end_time": end_time,
        "windows": windows
    }


def calculate_window_statistics(windows_result):
    """
    Calculate total visibility duration, percentage, and
    longest continuous visible and non-visible intervals.
    """

    start = parse_utc(windows_result["start_time"])
    end = parse_utc(windows_result["end_time"])

    total_hours = (end - start).total_seconds() / 3600.0

    statistics = {}

    for body in ("sun", "earth", "both"):

        windows = windows_result["windows"][body]

        visible_hours = sum(
            window["duration_hours"] for window in windows
        )

        longest_visible = max(
            (window["duration_hours"] for window in windows),
            default=0.0
        )

        # Calculate gaps between visibility windows. A gap or window that
        # touches either end of the range may continue beyond it, so the
        # true duration is at least the value given ("clipped").
        gaps = []

        previous_end = start

        for window in windows:

            window_start = parse_utc(window["start"])
            window_end = parse_utc(window["end"])

            gaps.append((
                (window_start - previous_end).total_seconds() / 3600.0,
                previous_end == start
            ))

            previous_end = window_end

        gaps.append((
            (end - previous_end).total_seconds() / 3600.0,
            True
        ))

        longest_gap = max(gaps, key=lambda g: g[0])
        longest_window = max(windows, key=lambda w: w["duration_hours"], default=None)

        statistics[body] = {
            "visible_hours": visible_hours,
            "visible_percent": 100 * visible_hours / total_hours,
            "longest_visible_hours": longest_visible,
            "longest_visible_clipped": bool(
                longest_window
                and (longest_window.get("clipped_start") or longest_window.get("clipped_end"))
            ),
            "longest_not_visible_hours": longest_gap[0],
            "longest_not_visible_clipped": bool(longest_gap[0] > 0 and longest_gap[1]),
        }

    return statistics