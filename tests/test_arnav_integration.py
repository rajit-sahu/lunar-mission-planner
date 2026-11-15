from Science.terrain_adapter import load_arnav_terrain
from Science.science_pipeline import run_site_analysis
from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    clear_kernels
)

# Load Arnav's synthetic terrain output
terrain_path = "Terrain/data/processed/site_001_terrain.json"

site = load_arnav_terrain(terrain_path)

print("Terrain loaded:", site["site_id"])
print("Latitude:", site["latitude_deg"])
print("Longitude:", site["longitude_deg"])
print("Observer elevation:", site["elevation_km"], "km")

# Load SPICE kernels
load_kernels([
    "kernels/latest_leapseconds.tls",
    "kernels/de440s.bsp",
    "kernels/moon_pa_de440_200625.bpc",
    "kernels/moon_de440_250416.tf"
])

try:
    print("\nRunning complete science pipeline...")

    result = run_site_analysis(
        site=site,
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=15
    )

    print("\n===== INTEGRATED RESULTS =====")

    for body in ("sun", "earth", "both"):
        stats = result["statistics"][body]

        print(f"\n{body.upper()}")
        print("Visible percentage:", stats["visible_percent"])
        print("Visible hours:", stats["visible_hours"])
        print("Longest visibility:", stats["longest_visible_hours"])
        print("Longest outage:", stats["longest_not_visible_hours"])

    print("\nIntegration test completed successfully.")

finally:
    clear_kernels()