import numpy as np

from Science.visibility.terrain_visibility import (
    interpolate_horizon,
    check_visibility,
    compare_sun_earth
)


# Temporary synthetic horizon profile
# Replace with Arnav's actual horizon data later.

horizon_azimuths = np.arange(0, 360, 10)

horizon_elevations = np.full(
    len(horizon_azimuths),
    2.0
)

# Introduce an artificial ridge between 90° and 120°
horizon_elevations[
    (horizon_azimuths >= 90) &
    (horizon_azimuths <= 120)
] = 5.0


# Test 1: Interpolation
print("===== INTERPOLATION TEST =====")

print(
    interpolate_horizon(
        105,
        horizon_azimuths,
        horizon_elevations
    )
)


# Test 2: Visibility
print("\n===== VISIBILITY TEST =====")

print(
    check_visibility(
        body_azimuth=105,
        body_elevation=4,
        horizon_azimuths=horizon_azimuths,
        horizon_elevations=horizon_elevations
    )
)


# Test 3: Sun/Earth comparison
print("\n===== SUN/EARTH TEST =====")

positions = {
    "site_id": "test_site",
    "time": "2028-11-20T12:00:00Z",

    "sun": {
        "azimuth_deg": 106.169407,
        "elevation_deg": -0.269693
    },

    "earth": {
        "azimuth_deg": 336.301429,
        "elevation_deg": 4.785296
    }
}

result = compare_sun_earth(
    positions,
    horizon_azimuths,
    horizon_elevations
)

print("Sun:", result["sun"])
print("Earth:", result["earth"])