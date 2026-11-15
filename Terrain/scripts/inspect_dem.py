"""Inspect a downloaded NASA DEM to confirm projection / coverage before analyzing."""
import argparse
import json
from pathlib import Path
import rasterio
from science.terrain.dem import RasterStack


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--dem', required=True)
    parser.add_argument('--sites', default='config/sites.json')
    args = parser.parse_args(argv)
    with rasterio.open(args.dem) as ds:
        print('GeoTIFF:', args.dem)
        print('Dimensions:', ds.width, 'x', ds.height)
        print('Pixel resolution (m):', ds.res)
        print('CRS:', ds.crs)
        print('Bounds (projected m):', ds.bounds)
        print('No-data sentinel:', ds.nodata)
        print('Raster tags:', ds.tags())
    print('\nSample published coordinates:')
    with RasterStack([args.dem]) as stack:
        for site in json.loads(Path(args.sites).read_text()):
            h = stack.sample([site['latitude_deg']], [site['longitude_deg']])[0]
            print(f"{site['id']}: {h:.3f} m" if h == h else f"{site['id']}: NOT COVERED")
    print('\nCaution: compare lunar reference frame and prime meridian with the NASA data documentation.')

if __name__ == '__main__':
    main()
