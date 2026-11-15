import numpy as np
import pytest
from science.terrain.geometry import (enu_basis, great_circle_targets,
    terrain_elevation_angle, visibility, MOON_RADIUS_M)


def test_enu_orthonormal_at_south_pole():
    e, n, u = enu_basis(-90, 45)
    matrix = np.stack([e, n, u])
    np.testing.assert_allclose(matrix @ matrix.T, np.eye(3), atol=1e-14)


def test_azimuth_east_moves_east():
    lat, lon, _ = great_circle_targets(-88, 22, 90, 1000)
    assert lon > 22


def test_north_moves_towards_equator():
    lat, lon, _ = great_circle_targets(-88, 22, 0, 1000)
    assert lat > -88
    assert lon == pytest.approx(22)


def test_spherical_curvature_flat_terrain():
    d = 100000.0
    _, _, u = great_circle_targets(-89, 35, 30, d)
    angle = terrain_elevation_angle(-89, 35, 0, 0, u, 0)
    expected = -np.rad2deg(d / (2*MOON_RADIUS_M))
    assert angle == pytest.approx(expected, abs=1e-9)


def test_observer_height_lowers_horizon_angle():
    _, _, u = great_circle_targets(-89, 35, 90, 200)
    low = terrain_elevation_angle(-89, 35, 0, 0, u, 0)
    high = terrain_elevation_angle(-89, 35, 0, 2, u, 0)
    assert high < low


def test_360_wrap_visibility_interpolation():
    horizon = np.zeros(360)
    horizon[359] = 10
    horizon[0] = 2
    assert visibility(6, 359.5, horizon) is False
    assert visibility(6.1, 359.5, horizon) is True
    horizon[0] = np.nan
    assert visibility(10, 359.5, horizon) is None


def test_missing_bins_fail_loudly():
    with pytest.raises(ValueError):
        visibility(10, 0, [0, 1])
