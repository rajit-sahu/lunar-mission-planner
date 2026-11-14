"""Run from the repository root:  python -m pytest Backend

These call the real SPICE pipeline, so the kernels/ folder must be present.
"""

from fastapi.testclient import TestClient

from Backend.app.main import app

client = TestClient(app)
SITE = "malapert-massif"
RANGE = {"start": "2028-11-20T00:00:00Z", "end": "2028-12-04T00:00:00Z"}


def test_health_reports_real_ephemeris():
    assert client.get("/health").json()["ephemeris_source"] == "spice"


def test_sites_lists_three_regions():
    sites = client.get("/sites").json()
    assert len(sites) == 3
    assert {"id", "name", "latitude_deg", "longitude_deg", "elevation_km"} <= sites[0].keys()


def test_unknown_site_is_404():
    assert client.get("/sites/nowhere/horizon").status_code == 404
    assert client.get("/compare", params={"site_ids": ["nowhere"], **RANGE}).status_code == 404


def test_horizon_covers_full_circle():
    body = client.get(f"/sites/{SITE}/horizon").json()
    assert len(body["horizon_azimuths"]) == len(body["horizon_elevations"]) == 360


def test_position_follows_conventions():
    body = client.get(f"/sites/{SITE}/position", params={"time": "2028-11-20T12:00:00Z"}).json()
    assert body["time"] == "2028-11-20T12:00:00Z"
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
    ids = ["de-gerlache-rim", "nobile-rim"]
    body = client.get("/compare", params={"site_ids": ids, **RANGE, "step_minutes": 60}).json()
    assert [row["site_id"] for row in body["comparison"]] == ids
    assert [site["site_id"] for site in body["sites"]] == ids
    for row in body["comparison"]:
        assert 0 <= row["both_visible_percent"] <= row["sun_visible_percent"] <= 100


def test_bad_ranges_are_rejected():
    backwards = {"start": "2028-11-02T00:00:00Z", "end": "2028-11-01T00:00:00Z"}
    assert client.get(f"/sites/{SITE}/analysis", params=backwards).status_code == 400
    huge = {"start": "2028-01-01T00:00:00Z", "end": "2029-01-01T00:00:00Z", "step_minutes": 1}
    assert client.get(f"/sites/{SITE}/analysis", params=huge).status_code == 400
    too_short = {"start": "2028-11-01T00:00:00Z", "end": "2028-11-01T00:05:00Z"}
    assert client.get(f"/sites/{SITE}/analysis", params=too_short).status_code == 400
