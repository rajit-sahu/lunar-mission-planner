import numpy as np

from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    clear_kernels
)

from Science.visibility.visibility_timeline import (
    generate_visibility_timeline
)


# Synthetic horizon
horizon_azimuths = np.arange(0, 360, 10)

horizon_elevations = np.full(
    len(horizon_azimuths),
    2.0
)

# Artificial ridge
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

    result = generate_visibility_timeline(
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=60,
        latitude_deg=-85.0,
        longitude_deg=30.0,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations,
        site_id="test_site"
    )

    timeline = result["timeline"]

    print("Total samples:", len(timeline))

    print("\n===== FIRST SAMPLE =====")
    print(timeline[0])

    print("\n===== LAST SAMPLE =====")
    print(timeline[-1])

    print("\n===== VISIBILITY COUNTS =====")

    sun_count = sum(row["sun_visible"] for row in timeline)
    earth_count = sum(row["earth_visible"] for row in timeline)
    both_count = sum(row["both_visible"] for row in timeline)

    print("Sun visible samples:", sun_count)
    print("Earth visible samples:", earth_count)
    print("Both visible samples:", both_count)

finally:
    clear_kernels()