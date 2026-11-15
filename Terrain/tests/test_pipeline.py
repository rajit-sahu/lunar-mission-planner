from pathlib import Path
import json
import numpy as np
import pytest
from scripts.create_synthetic_fixture import create
from science.terrain.dem import RasterStack
from science.terrain.pipeline import process_site, export_site


@pytest.fixture
def synthetic(tmp_path):
    path = create(tmp_path/'SYNTHETIC_test_dem.tif')
    site = json.loads(Path('config/sites.json').read_text())[0]
    return path, site


def test_dem_and_horizon_and_contract(synthetic, tmp_path):
    path, site = synthetic
    with RasterStack([path]) as dem:
        z = dem.sample([site['latitude_deg']], [site['longitude_deg']])[0]
        assert 970 < z < 1020
        result = process_site(site, dem, max_distance_m=1000,
            near_step_m=20, mid_step_m=40, far_step_m=80, outer_step_m=160)
    assert result['status'] == 'synthetic_test_only'
    assert result['science_ready'] is False
    assert len(result['terrain_horizon']) == 360
    assert np.isfinite(result['slope_deg'])
    # The deliberately inserted eastward hill obstructs the eastern horizon.
    east = result['terrain_horizon'][90]['elevation_deg']
    west = result['terrain_horizon'][270]['elevation_deg']
    assert east > west + 4
    out = export_site(tmp_path, result)
    assert json.loads(out.read_text())['terrain_horizon'][90]['azimuth_deg'] == 90


def test_unknown_dem_coverage_is_not_faked(synthetic):
    path, site = synthetic
    with RasterStack([path]) as dem:
        z = dem.sample([-83], [0])
        assert np.isnan(z[0])


def test_missing_dem_is_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        RasterStack([tmp_path/'fake.tif'])
