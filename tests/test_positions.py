print("TEST SCRIPT STARTED")

from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    sun_earth_positions,
    clear_kernels
)

# Load the required SPICE kernels
load_kernels([
    "kernels/latest_leapseconds.tls",
    "kernels/de440s.bsp",
    "kernels/moon_pa_de440_200625.bpc",
    "kernels/moon_de440_250416.tf"
])

try:
    # Test location near the lunar south pole
    result = sun_earth_positions(
        timestamp="2028-11-20T12:00:00Z",
        latitude_deg=-85.0,
        longitude_deg=30.0,
        site_id="test_site"
    )

    # Display results
    print("\n===== SUN =====")
    print("Azimuth:", result["sun"]["azimuth_deg"], "degrees")
    print("Elevation:", result["sun"]["elevation_deg"], "degrees")
    print("Distance:", result["sun"]["distance_km"], "km")

    print("\n===== EARTH =====")
    print("Azimuth:", result["earth"]["azimuth_deg"], "degrees")
    print("Elevation:", result["earth"]["elevation_deg"], "degrees")
    print("Distance:", result["earth"]["distance_km"], "km")

    print("\n===== FULL RESULT =====")
    print(result)

finally:
    # Always unload kernels after testing
    clear_kernels()