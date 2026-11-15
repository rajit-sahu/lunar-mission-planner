"""Terrain comparison, thresholds and disc fractions."""

import math

import pytest

from Science.visibility.terrain_visibility import (
    SUN_ANGULAR_RADIUS_DEG,
    angular_radius_deg,
    check_visibility,
    disc_fraction,
    interpolate_horizon,
    visibility_thresholds,
)

AZ = list(range(360))


def test_interpolation_wraps_at_north():
    elev = [0.0] * 360
    elev[359], elev[0] = 2.0, 4.0
    assert interpolate_horizon(359.5, AZ, elev) == pytest.approx(3.0)
    assert interpolate_horizon(-0.5, AZ, elev) == pytest.approx(3.0)
    assert interpolate_horizon(720.0, AZ, elev) == pytest.approx(4.0)


def test_visible_means_clearance_above_threshold():
    flat = [1.0] * 360
    v = check_visibility(10.0, 1.2, AZ, flat)
    assert v["visible"] and v["clearance_deg"] == pytest.approx(0.2)
    assert not check_visibility(10.0, 1.2, AZ, flat, threshold_deg=0.3)["visible"]
    assert not check_visibility(10.0, 1.0, AZ, flat)["visible"]  # exactly on the horizon is not visible


def test_disc_fraction():
    r = SUN_ANGULAR_RADIUS_DEG
    assert disc_fraction(0.0, r) == pytest.approx(0.5)
    assert disc_fraction(r, r) == 1.0 and disc_fraction(-r, r) == 0.0
    assert disc_fraction(r / 2, r) + disc_fraction(-r / 2, r) == pytest.approx(1.0)
    assert disc_fraction(0.1, r) > disc_fraction(0.05, r) > 0.5


def test_angular_radii():
    assert angular_radius_deg("sun", 1.496e8) == pytest.approx(0.2665, abs=0.001)
    assert angular_radius_deg("earth", 384_400) == pytest.approx(math.degrees(math.asin(6371 / 384_400)))


def test_thresholds():
    assert visibility_thresholds() == {"sun": 0.0, "earth": 0.0}
    t = visibility_thresholds("full", 2.0)
    assert t["sun"] == pytest.approx(SUN_ANGULAR_RADIUS_DEG) and t["earth"] == 2.0
    assert visibility_thresholds("limb")["sun"] == pytest.approx(-SUN_ANGULAR_RADIUS_DEG)
    with pytest.raises(ValueError):
        visibility_thresholds("edge")
    with pytest.raises(ValueError):
        visibility_thresholds("centre", -1)
