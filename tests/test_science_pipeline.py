import json
import numpy as np

from Science.ephemeris.sun_earth_positions import (
    load_kernels,
    clear_kernels
)

from Science.science_pipeline import (
    run_site_analysis,
    run_site_comparison
)


# --------------------------------------------------
# 1. Create synthetic terrain
# --------------------------------------------------

azimuths = np.arange(0, 360, 10)

site_A = {
    "site_id": "site_A",
    "latitude_deg": -85.0,
    "longitude_deg": 30.0,
    "elevation_km": 0.0,
    "horizon_azimuths": azimuths.tolist(),
    "horizon_elevations": np.full(len(azimuths), 2.0).tolist()
}

site_B = {
    "site_id": "site_B",
    "latitude_deg": -87.0,
    "longitude_deg": 45.0,
    "elevation_km": 0.0,
    "horizon_azimuths": azimuths.tolist(),
    "horizon_elevations": np.full(len(azimuths), 5.0).tolist()
}

sites = [site_A, site_B]


# --------------------------------------------------
# 2. Load SPICE kernels
# --------------------------------------------------

load_kernels([
    "kernels/latest_leapseconds.tls",
    "kernels/de440s.bsp",
    "kernels/moon_pa_de440_200625.bpc",
    "kernels/moon_de440_250416.tf"
])


try:

    # --------------------------------------------------
    # 3. Test single-site analysis
    # --------------------------------------------------

    print("\n===== TESTING SINGLE-SITE PIPELINE =====")

    result = run_site_analysis(
        site=site_A,
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=15
    )

    assert result["site_id"] == "site_A"
    assert "coordinates" in result
    assert "timeline" in result
    assert "windows" in result
    assert "statistics" in result

    assert len(result["timeline"]) == 1345

    assert set(result["windows"]) == {
        "sun", "earth", "both"
    }

    assert set(result["statistics"]) == {
        "sun", "earth", "both"
    }

    # Check that the output is JSON serializable
    json_output = json.dumps(result, allow_nan=False)

    print("Single-site structure: PASS")
    print("Timeline length: PASS")
    print("JSON serialization: PASS")

    print(
        "Sun visibility:",
        result["statistics"]["sun"]["visible_percent"],
        "%"
    )

    print("JSON size:", len(json_output), "characters")

    # --------------------------------------------------
    # 4. Test multi-site comparison
    # --------------------------------------------------

    print("\n===== TESTING MULTI-SITE PIPELINE =====")

    comparison_result = run_site_comparison(
        sites=sites,
        start_time="2028-11-20T00:00:00Z",
        end_time="2028-12-04T00:00:00Z",
        step_minutes=15
    )

    assert len(comparison_result["comparison"]) == 2
    assert len(comparison_result["sites"]) == 2

    assert comparison_result["comparison"][0]["site_id"] == "site_A"
    assert comparison_result["comparison"][1]["site_id"] == "site_B"

    # Check physical consistency
    for site in comparison_result["comparison"]:

        assert (
            site["both_visible_percent"]
            <= site["sun_visible_percent"] + 1e-8
        )

        assert (
            site["both_visible_percent"]
            <= site["earth_visible_percent"] + 1e-8
        )

        assert 0 <= site["sun_visible_percent"] <= 100
        assert 0 <= site["earth_visible_percent"] <= 100
        assert 0 <= site["both_visible_percent"] <= 100

    # Check JSON serialization
    comparison_json = json.dumps(
        comparison_result,
        allow_nan=False
    )

    print("Multi-site structure: PASS")
    print("Physical consistency: PASS")
    print("JSON serialization: PASS")

    print("JSON size:", len(comparison_json), "characters")

    # --------------------------------------------------
    # 5. Save example JSON for Rajit
    # --------------------------------------------------

    with open(
        "tests/example_science_output.json",
        "w"
    ) as file:

        json.dump(
            comparison_result,
            file,
            indent=2,
            allow_nan=False
        )

    print("\nExample JSON saved:")
    print("tests/example_science_output.json")

    print("\n===== ALL PIPELINE TESTS PASSED =====")


finally:
    clear_kernels()