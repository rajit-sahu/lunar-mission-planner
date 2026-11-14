import numpy as np

from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    clear_kernels
)

from Science.comparison.site_comparison import compare_sites


azimuths = np.arange(0, 360, 10)

# Site A: relatively low terrain
horizon_A = np.full(len(azimuths), 2.0)

# Site B: higher surrounding terrain
horizon_B = np.full(len(azimuths), 5.0)

# Site C: low terrain with a ridge
horizon_C = np.full(len(azimuths), 1.0)

horizon_C[
    (azimuths >= 90) &
    (azimuths <= 150)
] = 6.0


sites = [
    {
        "site_id": "site_A",
        "latitude_deg": -85.0,
        "longitude_deg": 30.0,
        "elevation_km": 0.0,
        "horizon_azimuths": azimuths,
        "horizon_elevations": horizon_A
    },
    {
        "site_id": "site_B",
        "latitude_deg": -87.0,
        "longitude_deg": 45.0,
        "elevation_km": 0.0,
        "horizon_azimuths": azimuths,
        "horizon_elevations": horizon_B
    },
    {
        "site_id": "site_C",
        "latitude_deg": -89.0,
        "longitude_deg": 90.0,
        "elevation_km": 0.0,
        "horizon_azimuths": azimuths,
        "horizon_elevations": horizon_C
    }
]


load_kernels([
    "kernels/latest_leapseconds.tls",
    "kernels/de440s.bsp",
    "kernels/moon_pa_de440_200625.bpc",
    "kernels/moon_de440_250416.tf"
])

try:
    result = compare_sites(
        sites=sites,
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=15
    )

    print("\n===== SITE COMPARISON =====")

    for site in result["comparison"]:
        print(f"\n{site['site_id']}")

        for key, value in site.items():
            if key != "site_id":
                print(f"{key}: {value:.2f}")

finally:
    clear_kernels()