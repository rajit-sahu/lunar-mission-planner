"""Run from the repository root:  python -m pytest Backend

These call the real SPICE pipeline, so the kernels/ folder must be present.
Terrain is isolated per test: by default no terrain files exist (placeholder
horizon), and tests that need a real one write it with the terrain_file fixture.
"""

import json

import pytest
from fastapi.testclient import TestClient

from Backend.app import science
from Backend.app.main import app

client = TestClient(app)
SITE = "site_malapert"
RANGE = {"start": "2028-11-20T00:00:00Z", "end": "2028-12-04T00:00:00Z"}


@pytest.fixture(autouse=True)
def terrain_dir(tmp_path, monkeypatch):
    """Point the backend at an empty terrain folder and reset its caches."""
    monkeypatch.setattr(science, "TERRAIN_DIR", tmp_path)
    science.terrain.cache_clear()
    science.site_input.cache_clear()
    yield tmp_path
    science.terrain.cache_clear()
    science.site_input.cache_clear()


@pytest.fixture
def terrain_file(terrain_dir):
    """Write a terrain file shaped like the terrain pipeline's output."""

    def write(status=science.REAL_TERRAIN_STATUS, horizon_deg=1.0, gap_at=None):
        rows = [
            {"azimuth_deg": az, "elevation_deg": None if az == gap_at else horizon_deg}
            for az in range(360)
        ]
        data = {
            "status": status,
            "site_id": SITE,
            "elevation_m": 4500.0,
            "slope_deg": 3.2,
            "observer_height_m": 2,
            "terrain_horizon": rows,
        }
        (terrain_dir / f"{SITE}_terrain.json").write_text(json.dumps(data), encoding="utf-8")
        return data

    return write


def test_sites_come_from_config():
    sites = client.get("/sites").json()
    assert [s["id"] for s in sites] == ["site_001", "site_004", "site_malapert"]
    assert sites[0]["latitude_deg"] == -89.45 and sites[0]["longitude_deg"] == 222.69
    assert all(s["terrain_source"] == "placeholder" and s["elevation_m"] is None for s in sites)


def test_unknown_site_is_404():
    assert client.get("/sites/nowhere/horizon").status_code == 404
    assert client.get("/compare", params={"site_ids": ["nowhere"], **RANGE}).status_code == 404


def test_placeholder_horizon_covers_full_circle():
    body = client.get(f"/sites/{SITE}/horizon").json()
    assert body["terrain_source"] == "placeholder"
    assert len(body["horizon_azimuths"]) == len(body["horizon_elevations"]) == 360
    assert client.get(f"/sites/{SITE}/terrain").status_code == 404


def test_position_follows_conventions():
    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00Z"}).json()
    assert body["time"] == "2028-11-20T12:00:00Z"
    assert body["ephemeris_source"] == "spice"
    for name in ("sun", "earth"):
        state = body[name]
        assert 0 <= state["azimuth_deg"] < 360
        assert -90 <= state["elevation_deg"] <= 90
        assert state["visible"] == (state["elevation_deg"] > state["terrain_horizon_deg"])
    assert body["both_visible"] == (body["sun"]["visible"] and body["earth"]["visible"])


def test_time_without_offset_is_treated_as_utc():
    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00"}).json()
    assert body["time"] == "2028-11-20T12:00:00Z"


def test_position_matches_analysis_timeline():
    """The dashboard (position) and the plots (analysis) must show the same angles."""
    row = client.get(f"/sites/{SITE}/analysis", params=RANGE).json()["timeline"][48]
    body = client.get(f"/sites/{SITE}/position", params={"time": row["time"]}).json()
    assert body["sun"]["azimuth_deg"] == row["sun_azimuth_deg"]
    assert body["earth"]["elevation_deg"] == row["earth_elevation_deg"]
    assert body["sun"]["visible"] == row["sun_visible"]


def test_analysis_has_timeline_windows_and_statistics():
    body = client.get(f"/sites/{SITE}/analysis", params=RANGE).json()
    assert body["site_id"] == SITE
    assert len(body["timeline"]) == 1345  # 14 days at the default 15 minutes
    assert set(body["windows"]) == set(body["statistics"]) == {"sun", "earth", "both"}
    assert body["terrain_source"] == "placeholder"


def test_compare_returns_one_row_per_site_in_order():
    ids = ["site_004", "site_001"]
    body = client.get("/compare", params={"site_ids": ids, **RANGE, "step_minutes": 60}).json()
    assert [row["site_id"] for row in body["comparison"]] == ids
    assert [site["site_id"] for site in body["sites"]] == ids
    assert body["terrain_sources"] == {"site_004": "placeholder", "site_001": "placeholder"}
    for row in body["comparison"]:
        assert 0 <= row["both_visible_percent"] <= row["sun_visible_percent"] <= 100


def test_bad_ranges_are_rejected():
    backwards = {"start": "2028-11-02T00:00:00Z", "end": "2028-11-01T00:00:00Z"}
    assert client.get(f"/sites/{SITE}/analysis", params=backwards).status_code == 400
    huge = {"start": "2028-01-01T00:00:00Z", "end": "2029-01-01T00:00:00Z", "step_minutes": 1}
    assert client.get(f"/sites/{SITE}/analysis", params=huge).status_code == 400
    too_short = {"start": "2028-11-01T00:00:00Z", "end": "2028-11-01T00:05:00Z"}
    assert client.get(f"/sites/{SITE}/analysis", params=too_short).status_code == 400


def test_real_terrain_file_replaces_placeholder(terrain_file):
    data = terrain_file(horizon_deg=1.0)
    assert client.get(f"/sites/{SITE}/terrain").json() == data

    site = next(s for s in client.get("/sites").json() if s["id"] == SITE)
    assert (site["terrain_source"], site["elevation_m"], site["slope_deg"]) == ("lola", 4500.0, 3.2)

    horizon = client.get(f"/sites/{SITE}/horizon").json()
    assert horizon["terrain_source"] == "lola"
    assert set(horizon["horizon_elevations"]) == {1.0}

    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00Z"}).json()
    assert body["terrain_source"] == "lola"
    assert body["sun"]["terrain_horizon_deg"] == body["earth"]["terrain_horizon_deg"] == 1.0


def test_real_terrain_puts_observer_at_surface_plus_eye_height(terrain_file):
    terrain_file()
    assert science.site_input(SITE)["elevation_km"] == pytest.approx(4.502)
    body = client.get(f"/sites/{SITE}/analysis", params={**RANGE, "step_minutes": 60}).json()
    assert body["coordinates"]["elevation_km"] == pytest.approx(4.502)


def test_synthetic_terrain_is_never_used(terrain_file):
    terrain_file(status="synthetic_test_only")
    assert client.get(f"/sites/{SITE}/horizon").json()["terrain_source"] == "placeholder"
    assert client.get(f"/sites/{SITE}/terrain").status_code == 404


def test_horizon_with_unknown_bins_is_refused_not_treated_as_clear(terrain_file):
    terrain_file(gap_at=90)
    params = {"time": "2028-11-20T12:00:00Z"}
    assert client.get(f"/sites/{SITE}/position", params=params).status_code == 409
    assert client.get(f"/sites/{SITE}/analysis", params=RANGE).status_code == 409
    # The raw terrain file is still served so the gap can be inspected.
    assert client.get(f"/sites/{SITE}/terrain").status_code == 200
