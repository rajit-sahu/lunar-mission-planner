"""Timeline, refined windows and statistics."""

from datetime import timedelta

import pytest

from Science.science_pipeline import run_site_analysis, run_site_comparison
from Science.visibility.terrain_visibility import visibility_thresholds
from Science.visibility.visibility_timeline import generate_visibility_timeline, parse_utc
from Science.visibility.visibility_windows import calculate_window_statistics, find_visibility_windows

START, END = "2028-11-20T00:00:00Z", "2028-12-04T00:00:00Z"


@pytest.fixture
def analysis(flat_site):
    return run_site_analysis(flat_site, START, END, step_minutes=60)


def test_timeline_rows(analysis):
    rows = analysis["timeline"]
    assert len(rows) == 14 * 24 + 1
    for r in rows[:50]:
        assert r["sun_visible"] == (r["sun_clearance_deg"] > 0)
        assert r["both_visible"] == (r["sun_visible"] and r["earth_visible"])
        assert 0.0 <= r["sun_disc_fraction"] <= 1.0
        assert r["sun_clearance_deg"] == pytest.approx(r["sun_elevation_deg"] - r["sun_horizon_deg"])


def test_windows_agree_with_samples(analysis):
    """Every sample inside a refined window is visible; every sample outside is not."""
    wins = [(parse_utc(w["start"]), parse_utc(w["end"])) for w in analysis["windows"]["sun"]]
    for r in analysis["timeline"]:
        t = parse_utc(r["time"])
        inside = any(a < t < b for a, b in wins)
        on_edge = any(abs((t - a).total_seconds()) < 60 or abs((t - b).total_seconds()) < 60 for a, b in wins)
        if not on_edge:
            assert inside == r["sun_visible"], r["time"]


def test_statistics_are_consistent(analysis):
    s = analysis["statistics"]
    total = 14 * 24
    for body in ("sun", "earth", "both"):
        assert 0 <= s[body]["visible_hours"] <= total + 1e-6
        assert s[body]["visible_percent"] == pytest.approx(100 * s[body]["visible_hours"] / total)
    assert s["both"]["visible_hours"] <= min(s["sun"]["visible_hours"], s["earth"]["visible_hours"]) + 1e-6


def test_clipped_windows_are_flagged(analysis):
    for key in ("sun", "earth", "both"):
        for w in analysis["windows"][key]:
            assert w["clipped_start"] == (w["start"] == START)
            assert w["clipped_end"] == (w["end"] == END)


def test_stricter_sun_criterion_means_less_sunlight(flat_site):
    hours = {}
    for crit in ("limb", "centre", "full"):
        a = run_site_analysis(flat_site, START, END, 60, visibility_thresholds(crit))
        hours[crit] = a["statistics"]["sun"]["visible_hours"]
    assert hours["limb"] >= hours["centre"] >= hours["full"]


def test_earth_margin_reduces_earth_time(flat_site):
    base = run_site_analysis(flat_site, START, END, 60)["statistics"]["earth"]["visible_hours"]
    strict = run_site_analysis(flat_site, START, END, 60, visibility_thresholds("centre", 3.0))
    assert strict["statistics"]["earth"]["visible_hours"] <= base


def test_sample_exactly_on_threshold_does_not_crash(flat_site):
    """Regression: a clearance of exactly the threshold used to raise AttributeError."""
    tl = generate_visibility_timeline(START, "2028-11-21T00:00:00Z", 60, flat_site["latitude_deg"],
                                      flat_site["longitude_deg"], flat_site["horizon_azimuths"],
                                      flat_site["horizon_elevations"], site_elevation_km=flat_site["elevation_km"])
    tl["timeline"][3]["sun_clearance_deg"] = 0.0
    result = find_visibility_windows(tl, flat_site["latitude_deg"], flat_site["longitude_deg"],
                                     flat_site["horizon_azimuths"], flat_site["horizon_elevations"],
                                     site_elevation_km=flat_site["elevation_km"])
    calculate_window_statistics(result)


def test_comparison_matches_individual_analyses(flat_site):
    other = {**flat_site, "site_id": "flat2", "horizon_elevations": [3.0] * 360}
    cmp = run_site_comparison([flat_site, other], START, "2028-11-27T00:00:00Z", 60)
    assert [row["site_id"] for row in cmp["comparison"]] == ["flat", "flat2"]
    for row, site in zip(cmp["comparison"], cmp["sites"]):
        assert row["sun_visible_percent"] == site["statistics"]["sun"]["visible_percent"]
    # A higher horizon can only hide the Sun more.
    assert cmp["comparison"][1]["sun_visible_percent"] <= cmp["comparison"][0]["sun_visible_percent"]


def test_range_validation(flat_site):
    with pytest.raises(ValueError):
        run_site_analysis(flat_site, END, START, 60)
    assert parse_utc(START) + timedelta(days=14) == parse_utc(END)


def test_comparison_respects_thresholds(flat_site):
    from Science.visibility.terrain_visibility import visibility_thresholds
    thr = visibility_thresholds("full", 5.0)
    cmp = run_site_comparison([flat_site], START, "2028-11-27T00:00:00Z", 60, thresholds=thr)
    one = run_site_analysis(flat_site, START, "2028-11-27T00:00:00Z", 60, thresholds=thr)
    assert cmp["comparison"][0]["earth_visible_percent"] == one["statistics"]["earth"]["visible_percent"]
