"""Generate a DEM for TESTING ONLY — not lunar LOLA measurements."""
from pathlib import Path
import json
import numpy as np
import rasterio
from rasterio.transform import from_origin
from pyproj import CRS, Transformer
from science.terrain.dem import MOON_GEOGRAPHIC_CRS
from science.terrain.geometry import MOON_RADIUS_M, great_circle_targets


def create(target='examples/SYNTHETIC_test_dem.tif'):
    site = json.loads(Path('config/sites.json').read_text())[0]
    lunar_stereographic = CRS.from_proj4(
        f'+proj=stere +lat_0=-90 +lon_0=0 +lat_ts=-90 '
        f'+a={MOON_RADIUS_M} +b={MOON_RADIUS_M} +units=m +no_defs'
    )
    trans = Transformer.from_crs(MOON_GEOGRAPHIC_CRS, lunar_stereographic, always_xy=True)
    x0, y0 = trans.transform(site['longitude_deg'], site['latitude_deg'])
    width = height = 260
    res = 20.0
    raster_transform = from_origin(x0-width/2*res, y0+height/2*res, res, res)
    rr, cc = np.indices((height, width))
    x = raster_transform.c + (cc+0.5)*res
    y = raster_transform.f - (rr+0.5)*res
    # Generate features via true local azimuths; raster X/Y do NOT equal local E/N.
    lat_e, lon_e, _ = great_circle_targets(site['latitude_deg'], site['longitude_deg'], 90.0, 350.0)
    lat_n, lon_n, _ = great_circle_targets(site['latitude_deg'], site['longitude_deg'], 0.0, 480.0)
    xe, ye = trans.transform(float(lon_e), float(lat_e))
    xn, yn = trans.transform(float(lon_n), float(lat_n))
    z = (1000 + 90*np.exp(-((x-xe)**2 + (y-ye)**2)/(2*140**2))
         - 20*np.exp(-((x-xn)**2 + (y-yn)**2)/(2*240**2))).astype('float32')
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(target,'w',driver='GTiff',height=height,width=width,
                       count=1,dtype='float32',crs=lunar_stereographic,
                       transform=raster_transform, nodata=-9999,compress='deflate') as ds:
        ds.write(z, 1)
        ds.update_tags(DATA_ORIGIN='SYNTHETIC FOR UNIT TESTING; NOT LOLA')
    return target

if __name__ == '__main__':
    print('TEST DATA ONLY:', create())
