"""Terrain-aware geometric horizon, with spherical curvature exactly represented."""
import numpy as np
from .geometry import great_circle_targets, terrain_elevation_angle


def sampling_distances(max_distance_m=120_000, near_step_m=10, mid_step_m=50,
                       far_step_m=250, outer_step_m=500):
    """Dense nearby sampling and coarser far terrain sampling.

    max distance is intentionally limited; taller distant peaks may lie beyond it.
    """
    if max_distance_m <= 0 or min(near_step_m, mid_step_m, far_step_m, outer_step_m) <= 0:
        raise ValueError("Sampling distances must be positive")
    bands = [(near_step_m, 500), (mid_step_m, 5000),
             (far_step_m, 40_000), (outer_step_m, float(max_distance_m))]
    samples = []
    previous = 0.0
    for step, limit in bands:
        upper = min(limit, max_distance_m)
        if upper <= previous:
            continue
        arr = np.arange(previous + step, upper + 0.01, step)
        samples.extend(arr.tolist())
        previous = upper
    if not samples or samples[-1] < max_distance_m:
        samples.append(float(max_distance_m))
    return np.asarray(samples, dtype=float)


def calculate_horizon(stack, latitude_deg, longitude_deg, observer_elevation_m,
                      observer_height_m=2.0, azimuth_step_deg=1,
                      max_distance_m=120_000, near_step_m=10,
                      mid_step_m=50, far_step_m=250, outer_step_m=500,
                      chunk_azimuths=12):
    """Compute maxima over sampled terrain directions, preserving missing data flags.

    The calculated max is a LOWER BOUND on the true full horizon when the sampling
    is coarse, data is missing, or more distant terrain is outside max_distance.
    """
    if azimuth_step_deg != 1:
        raise ValueError("360-bin shared JSON format requires 1 degree azimuth steps")
    azimuths = np.arange(360, dtype=float)
    distances = sampling_distances(max_distance_m, near_step_m, mid_step_m,
                                   far_step_m, outer_step_m)
    angles_out = np.full(360, np.nan)
    best_distances = np.full(360, np.nan)
    sample_coverage = np.zeros(360, dtype=float)
    first_valid_distance = np.full(360, np.nan)
    for start in range(0, 360, chunk_azimuths):
        subset = azimuths[start:start+chunk_azimuths]
        az_grid, distance_grid = np.broadcast_arrays(subset[:, None], distances[None, :])
        lat_grid, lon_grid, unit = great_circle_targets(
            latitude_deg, longitude_deg, az_grid, distance_grid
        )
        terrain_z = stack.sample(lat_grid, lon_grid)
        valid = np.isfinite(terrain_z)
        sample_coverage[start:start+len(subset)] = np.mean(valid, axis=1)
        for row in range(len(subset)):
            usable = np.flatnonzero(valid[row])
            if not usable.size:
                continue
            first_valid_distance[start+row] = distances[usable[0]]
            angles = terrain_elevation_angle(latitude_deg, longitude_deg,
                observer_elevation_m, observer_height_m, unit[row, usable], terrain_z[row, usable])
            best = int(np.argmax(angles))
            angles_out[start+row] = float(angles[best])
            best_distances[start+row] = float(distances[usable[best]])
    return {
        "azimuths": azimuths,
        "elevation_angles": angles_out,
        "obstruction_distances_m": best_distances,
        "sample_coverage": sample_coverage,
        "first_valid_distance_m": first_valid_distance,
        "max_distance_m": max_distance_m,
        "sampling_distances_m": distances,
    }
