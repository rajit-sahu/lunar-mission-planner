"""Site-level calculations and front-end-friendly JSON output."""
from datetime import datetime, timezone
from pathlib import Path
import json
import csv
import numpy as np
from .dem import RasterStack, sample_local_slope
from .horizon import calculate_horizon
from .geometry import MOON_RADIUS_M


def _number(x, decimals=5):
    return round(float(x), decimals) if np.isfinite(x) else None


def process_site(site, elevation_stack, slope_map=None, observer_height_m=2,
                 slope_baseline_m=50, max_distance_m=120_000,
                 near_step_m=10, mid_step_m=50, far_step_m=250, outer_step_m=500):
    lat, lon = float(site['latitude_deg']), float(site['longitude_deg']) % 360
    if not (-90 <= lat <= -80):
        raise ValueError(f"{site['id']}: latitude must be in 80-90 S for this project")
    site_height_samples, site_height_sources = elevation_stack.sample([lat], [lon], return_source=True)
    z = float(site_height_samples[0])
    source_index = int(site_height_sources[0])
    if not np.isfinite(z):
        raise ValueError(f"{site['id']}: no valid elevation at lat={lat}, lon={lon}; check DEM coverage and CRS")
    computed_slope = sample_local_slope(elevation_stack, lat, lon, slope_baseline_m)
    reported_slope = computed_slope
    slope_method = f'central_difference_{slope_baseline_m:g}m_baseline'
    if slope_map is not None:
        val = float(slope_map.sample([lat], [lon])[0])
        if np.isfinite(val) and 0 <= val <= 90:
            reported_slope = val
            slope_method = 'NASA_LOLA_precomputed_slope_map'
    horizon = calculate_horizon(elevation_stack, lat, lon, z,
        observer_height_m=observer_height_m, max_distance_m=max_distance_m,
        near_step_m=near_step_m, mid_step_m=mid_step_m,
        far_step_m=far_step_m, outer_step_m=outer_step_m)
    coverage = horizon['sample_coverage']
    first_valid = horizon['first_valid_distance_m']
    profiles = []
    for a in range(360):
        profiles.append({
            'azimuth_deg': a,
            'elevation_deg': _number(horizon['elevation_angles'][a]),
            'obstruction_distance_km': _number(horizon['obstruction_distances_m'][a] / 1000, 3),
            'dem_sample_coverage_fraction': _number(coverage[a], 4),
            'nearest_valid_dem_sample_m': _number(first_valid[a], 1)
        })
    gaps = int(sum(0 if p['elevation_deg'] is not None else 1 for p in profiles))
    synthetic = any("synthetic" in layer[0].lower() for layer in elevation_stack.layers)
    return {
        'schema_version': '1.0',
        'status': 'synthetic_test_only' if synthetic else 'geotiff_calculated_pending_validation',
        'science_ready': False if synthetic else None,
        'site_id': site['id'],
        'name': site['name'],
        'latitude_deg': lat,
        'longitude_deg': lon,
        'site_coordinate_source': site.get('source'),
        'site_note': site.get('note'),
        'elevation_m': _number(z, 3),
        'elevation_source_path': elevation_stack.layers[source_index][0],
        'elevation_source_raster_pixel_size_m': [abs(float(x)) for x in elevation_stack.layers[source_index][1].res],
        'slope_deg': _number(reported_slope, 3) if reported_slope is not None else None,
        'slope_method': slope_method if reported_slope is not None else None,
        'computed_slope_deg': _number(computed_slope, 3) if computed_slope is not None else None,
        'observer_height_m': observer_height_m,
        'terrain_horizon': profiles,
        'terrain_horizon_semantics': 'Maximum line-of-sight elevation along a ray; lower bound with finite DEM coverage and sampling',
        'quality': {
            'azimuth_bins_without_elevation': gaps,
            'mean_dem_sample_coverage_fraction': _number(np.mean(coverage), 4),
            'min_dem_sample_coverage_fraction': _number(np.min(coverage), 4),
            'azimuth_bins_with_near_gap_gt_100m': int(np.sum(first_valid > 100)),
            'max_range_limit_km': max_distance_m / 1000,
            'complete_near_range_coverage': bool(np.all(np.isfinite(first_valid) & (first_valid <= near_step_m+0.1))),
            'horizon_samples_are_complete': bool(np.all(coverage >= (1-1e-12))),
            'caution': 'Incomplete coverage or limited range can hide higher obstacles; never interpret gaps as clear line of sight'
        },
        'model': {
            'horizontal_reference': 'spherical Moon local tangent plane (ENU)',
            'moon_fixed_frame': 'MOON_ME / DE421 (user must verify input DEMs; code cannot verify frame epoch)',
            'planetocentric_latitude_positive_north': True,
            'longitude_positive_east_0_to_360': True,
            'azimuth_clockwise_from_north_deg': True,
            'lunar_reference_radius_m': MOON_RADIUS_M,
            'observer_elevation_reference': 'height above 1737400 m lunar reference sphere',
            'max_horizon_distance_m': max_distance_m,
            'sampling_spacing_m': {'near_0_500m': near_step_m,
              'mid_500_5000m': mid_step_m, 'far_5_40km': far_step_m,
              'outer_40km_plus': outer_step_m},
            'dems_in_priority_order': [layer[0] for layer in elevation_stack.layers],
            'slope_map': slope_map.layers[0][0] if slope_map else None,
            'generated_utc': datetime.now(timezone.utc).isoformat()
        }
    }


def export_site(output_dir, result):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / (result['site_id'] + '_terrain.json')
    path.write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf-8')
    csv_path = output_dir / (result['site_id'] + '_horizon.csv')
    columns = ['azimuth_deg', 'elevation_deg', 'obstruction_distance_km',
               'dem_sample_coverage_fraction', 'nearest_valid_dem_sample_m']
    with csv_path.open('w', newline='', encoding='utf-8') as output:
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(result['terrain_horizon'])
    return path
