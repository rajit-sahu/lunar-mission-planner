"""Run from the repository root:  python -m pytest Backend"""

from fastapi.testclient import TestClient

from Backend.app import science
from Backend.app.main import app

client = TestClient(app)
SITE = "malapert-massif"


def test_sites_lists_three_regions():
    sites = client.get("/sites").json()
    assert len(sites) == 3
    assert {"id", "name", "latitude_deg", "longitude_deg", "elevation_km"} <= sites[0].keys()


def test_unknown_site_is_404():
    assert client.get("/sites/nowhere/horizon").status_code == 404


def test_position_follows_conventions():
    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00Z"}).json()
    assert body["time"] == "2028-11-20T12:00:00Z"
    for name in ("sun", "earth"):
        state = body[name]
        assert 0 <= state["azimuth_deg"] < 360
        assert -90 <= state["elevation_deg"] <= 90
        assert state["visible"] == (state["elevation_deg"] > state["horizon_elevation_deg"])
    assert body["both_visible"] == (body["sun"]["visible"] and body["earth"]["visible"])


def test_time_without_offset_is_treated_as_utc():
    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00"}).json()
    assert body["time"] == "2028-11-20T12:00:00Z"


def test_timeline_columns_line_up_and_windows_match():
    params = {"start": "2028-11-01T00:00:00Z", "end": "2028-12-01T00:00:00Z", "step_minutes": 120}
    body = client.get(f"/sites/{SITE}/timeline", params=params).json()
    samples = body["samples"]
    n = len(samples["time"])
    assert n == 361
    assert all(len(samples[b][k]) == n for b in ("sun", "earth") for k in samples[b])

    # Every sample inside a sun window is visible, and every other one is not.
    in_window = [
        any(w["start"] <= t < w["end"] for w in body["windows"]["sun"]) for t in samples["time"]
    ]
    assert in_window[:-1] == samples["sun"]["visible"][:-1]
    # A full lunar day at the placeholder site has both sunrise and sunset.
    assert True in samples["sun"]["visible"] and False in samples["sun"]["visible"]


def test_timeline_rejects_bad_ranges():
    backwards = {"start": "2028-11-02T00:00:00Z", "end": "2028-11-01T00:00:00Z"}
    assert client.get(f"/sites/{SITE}/timeline", params=backwards).status_code == 400
    huge = {"start": "2028-01-01T00:00:00Z", "end": "2029-01-01T00:00:00Z", "step_minutes": 1}
    assert client.get(f"/sites/{SITE}/timeline", params=huge).status_code == 400


def test_horizon_covers_full_circle():
    body = client.get(f"/sites/{SITE}/horizon").json()
    assert len(body["azimuth_deg"]) == len(body["horizon_elevation_deg"]) == 360


def test_horizon_interpolates_across_north():
    profile = {"azimuth_deg": [0, 90, 180, 270], "horizon_elevation_deg": [2.0, 0.0, 0.0, 4.0]}
    assert science.horizon_at(profile, 0) == 2.0
    assert science.horizon_at(profile, 45) == 1.0
    assert science.horizon_at(profile, 315) == 3.0  # between 270 and 0/360
    assert science.horizon_at(profile, 360) == 2.0
