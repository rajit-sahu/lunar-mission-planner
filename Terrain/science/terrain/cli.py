"""Command-line interface: run python -m science.terrain.cli --help."""
import argparse
import json
from pathlib import Path
from .dem import RasterStack
from .pipeline import process_site, export_site
from .plotting import plot_horizon


def main(argv=None):
    ap = argparse.ArgumentParser(description='LOLA GeoTIFF -> slopes, moon-curvature-aware 360° horizon and JSON')
    ap.add_argument('--dem', action='append', required=True,
        help='Elevation GeoTIFF path. Repeat from finest / preferred to coarsest fallback.')
    ap.add_argument('--site', action='append', help='Site id, repeat for multiple (default: all in sites JSON)')
    ap.add_argument('--sites-json', default='config/sites.json')
    ap.add_argument('--slope-map', action='append', default=[], metavar='ID=PATH',
        help='Optional slope GeoTIFF for one site, e.g. site_001=data/raw/Site01...slp.tif')
    ap.add_argument('--output-dir', default='data/processed')
    ap.add_argument('--plots-dir', default='plots')
    ap.add_argument('--observer-height-m', type=float, default=2)
    ap.add_argument('--slope-baseline-m', type=float, default=50)
    ap.add_argument('--max-distance-km', type=float, default=120)
    ap.add_argument('--near-step-m', type=float, default=10)
    ap.add_argument('--mid-step-m', type=float, default=50)
    ap.add_argument('--far-step-m', type=float, default=250)
    ap.add_argument('--outer-step-m', type=float, default=500)
    ap.add_argument('--subrays-per-bin', type=int, default=1,
                    help='Rays per 1-degree bin; the highest is kept (catches narrow peaks)')
    ap.add_argument('--crs-override', help='Use ONLY if metadata is absent AND manually verified')
    args = ap.parse_args(argv)
    if args.observer_height_m < 0 or args.max_distance_km <= 0:
        ap.error('observer height must be nonnegative and max distance must be positive')
    sites = json.loads(Path(args.sites_json).read_text(encoding='utf-8'))
    selected = [s for s in sites if not args.site or s['id'] in args.site]
    if not selected or (args.site and len(selected) != len(set(args.site))):
        ap.error('one or more requested site IDs were not found')
    slope_paths = {}
    for arg in args.slope_map:
        if '=' not in arg:
            ap.error('--slope-map must have ID=PATH format')
        id_, path = arg.split('=', 1)
        slope_paths[id_] = path
    with RasterStack(args.dem, crs_override=args.crs_override) as elev:
        for site in selected:
            print(f"Processing {site['id']} ({site['name']})", flush=True)
            if site['id'] in slope_paths:
                with RasterStack([slope_paths[site['id']]], crs_override=args.crs_override) as slp:
                    result = process_site(site, elev, slope_map=slp,
                        observer_height_m=args.observer_height_m,
                        slope_baseline_m=args.slope_baseline_m,
                        max_distance_m=args.max_distance_km*1000,
                        near_step_m=args.near_step_m, mid_step_m=args.mid_step_m,
                        far_step_m=args.far_step_m, outer_step_m=args.outer_step_m,
                        subrays_per_bin=args.subrays_per_bin)
            else:
                result = process_site(site, elev,
                    observer_height_m=args.observer_height_m,
                    slope_baseline_m=args.slope_baseline_m,
                    max_distance_m=args.max_distance_km*1000,
                    near_step_m=args.near_step_m, mid_step_m=args.mid_step_m,
                    far_step_m=args.far_step_m, outer_step_m=args.outer_step_m,
                        subrays_per_bin=args.subrays_per_bin)
            out = export_site(args.output_dir, result)
            figure = plot_horizon(result, Path(args.plots_dir)/f"{site['id']}_horizon.png")
            print(f"  elevation={result['elevation_m']} m; slope={result['slope_deg']}°")
            print(f"  mean data coverage={result['quality']['mean_dem_sample_coverage_fraction']:.1%}")
            print(f"  JSON: {out}\n  Plot: {figure}", flush=True)
    print('Done. Review the quality flags before sharing with visibility/POV teams.')

if __name__ == '__main__':
    main()
