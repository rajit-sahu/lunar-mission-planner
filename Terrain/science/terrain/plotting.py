"""Scientific plots, not a photorealistic surface model."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def plot_horizon(result, target):
    p = result['terrain_horizon']
    az = np.asarray([item['azimuth_deg'] for item in p])
    alt = np.asarray([np.nan if item['elevation_deg'] is None else item['elevation_deg'] for item in p])
    cov = np.asarray([item['dem_sample_coverage_fraction'] for item in p])
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(12, 6.8), sharex=True,
                                  gridspec_kw={'height_ratios': [3, 1]})
    ax.plot(az, alt, lw=1.5, label='LOLA-derived angular horizon')
    ax.axhline(0, lw=0.8, ls='--', alpha=0.5, label='Local horizontal plane')
    ax.set_ylabel('Horizon elevation (°)')
    ax.set_title(f"{result['name']} — terrain-aware lunar horizon\n"
                 f"Lat {result['latitude_deg']:.4f}°  •  Lon {result['longitude_deg']:.4f}°E  •  "
                 f"Observer {result['observer_height_m']} m")
    ax.legend(loc='upper right')
    ax.grid(alpha=0.24)
    ax2.plot(az, cov, lw=1.3)
    ax2.set_ylim(-0.04, 1.04)
    ax2.set_ylabel('DEM coverage\n(sample fraction)')
    ax2.set_xlabel('Azimuth (° clockwise from north)')
    ax2.set_xticks(np.arange(0, 361, 30))
    ax2.set_xlim(0, 359)
    ax2.grid(alpha=0.24)
    if result.get('status') == 'synthetic_test_only':
        fig.text(0.5, 0.52, 'SYNTHETIC TEST — NOT NASA LOLA',
                 ha='center', va='center', fontsize=20, alpha=0.27, rotation=15)
    fig.text(0.5, .005, 'Finite-distance, sampled terrain horizon; verify resolution and missing data before operational use.',
             ha='center', fontsize=8)
    fig.tight_layout(rect=(0,.025,1,1))
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(target, dpi=160)
    plt.close(fig)
    return target
