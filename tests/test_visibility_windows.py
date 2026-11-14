import numpy as np

from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    clear_kernels
)

from Science.visibility.visibility_timeline import (
    generate_visibility_timeline
)

from Science.visibility.visibility_windows import (
    find_visibility_windows,
    calculate_window_statistics,
    clearance_at_time
)



# Synthetic horizon profile
horizon_azimuths = np.arange(0, 360, 10)

horizon_elevations = np.full(
    len(horizon_azimuths),
    2.0
)

# Artificial ridge between 90° and 120°
horizon_elevations[
    (horizon_azimuths >= 90) &
    (horizon_azimuths <= 120)
] = 5.0


load_kernels([
    "kernels/latest_leapseconds.tls",
    "kernels/de440s.bsp",
    "kernels/moon_pa_de440_200625.bpc",
    "kernels/moon_de440_250416.tf"
])

try:

    print("Generating visibility timeline...")

    timeline_result = generate_visibility_timeline(
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=15,
        latitude_deg=-85.0,
        longitude_deg=30.0,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations,
        site_id="test_site"
    )

    print("Finding visibility windows...")

    windows_result = find_visibility_windows(
        timeline_result=timeline_result,
        latitude_deg=-85.0,
        longitude_deg=30.0,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations,
        site_id="test_site"
    )

    statistics = calculate_window_statistics(windows_result)

    print("\n===== VISIBILITY WINDOWS =====")

    for body in ("sun", "earth", "both"):

        print(f"\n{body.upper()}")

        for window in windows_result["windows"][body]:

            print(
                window["start"],
                "->",
                window["end"],
                f"({window['duration_hours']:.2f} hours)"
            )

    print("\n===== STATISTICS =====")

    for body, stats in statistics.items():

        print(f"\n{body.upper()}")

        for key, value in stats.items():

            print(f"{key}: {value:.2f}")

    transition = "2028-11-22T16:20:14.499307Z"

    for timestamp in [

        "2028-11-22T16:19:14Z",

        transition,

        "2028-11-22T16:21:14Z"

    ]:

        clearance = clearance_at_time(

            timestamp=timestamp,

            body="sun",

            latitude_deg=-85.0,

            longitude_deg=30.0,

            horizon_azimuths=horizon_azimuths,

            horizon_elevations=horizon_elevations,

            site_id="test_site"

        )

        print(timestamp, clearance)

finally:
    clear_kernels()