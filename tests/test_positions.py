"""Sun/Earth geometry, checked against JPL Horizons."""

import numpy as np
import pytest

from Science.ephemeris.sun_earth_positions import local_enu_basis, sun_earth_positions

# Reference values from the JPL Horizons API (2026-11-15): observer CENTER='coord@301',
# COORD_TYPE='GEODETIC', QUANTITIES='4' (apparent azimuth/elevation), APPARENT='AIRLESS'.
# Sites: Mons Malapert (5.171 km + 2 m) and Site 001 (1.955 km + 2 m) above the 1737.4 km sphere.
MALAPERT = (-85.992, 2.056, 5.173403)
SITE_001 = (-89.45, 222.69, 1.956847)
HORIZONS = [
    (MALAPERT, "2028-11-20T12:00:00Z", (134.058335254, -1.665956329), (4.354748795, 4.200254955)),
    (MALAPERT, "2028-11-25T00:00:00Z", (79.384334736, 1.817742934), (0.136451448, 9.542726858)),
    (SITE_001, "2028-11-20T12:00:00Z", (273.427057537, 1.155029644), (143.709052292, -0.239741931)),
    (SITE_001, "2028-11-25T00:00:00Z", (218.645607818, 0.646126028), (139.535969262, 5.114416685)),
]
TOLERANCE_DEG = 0.001  # measured agreement is better than 0.00001 deg


@pytest.mark.parametrize("site,time,sun,earth", HORIZONS)
def test_matches_jpl_horizons(site, time, sun, earth):
    lat, lon, h = site
    p = sun_earth_positions(time, lat, lon, elevation_km=h)
    for body, (az, el) in (("sun", sun), ("earth", earth)):
        d_az = (p[body]["azimuth_deg"] - az + 180) % 360 - 180
        assert abs(d_az) < TOLERANCE_DEG, f"{body} azimuth off by {d_az}"
        assert abs(p[body]["elevation_deg"] - el) < TOLERANCE_DEG, f"{body} elevation off"


def test_output_shape_and_conventions():
    p = sun_earth_positions("2028-11-20T12:00:00Z", *MALAPERT[:2], elevation_km=MALAPERT[2], site_id="x")
    assert p["time"] == "2028-11-20T12:00:00Z" and p["site_id"] == "x"
    for body in ("sun", "earth"):
        assert 0 <= p[body]["azimuth_deg"] < 360
        assert -90 <= p[body]["elevation_deg"] <= 90
    assert 1.4e8 < p["sun"]["distance_km"] < 1.6e8
    assert 3.5e5 < p["earth"]["distance_km"] < 4.1e5


def test_enu_basis_is_orthonormal():
    e, n, u = local_enu_basis(-89.45, 222.69)
    m = np.array([e, n, u])
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-12)


def test_rejects_exact_pole_and_naive_time():
    with pytest.raises(ValueError):
        local_enu_basis(-90.0, 0.0)
    with pytest.raises(ValueError):
        sun_earth_positions("2028-11-20T12:00:00", -85.0, 0.0)
