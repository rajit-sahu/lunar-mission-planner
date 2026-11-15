"""Find the highest 5 m DEM cell within a radius of each published site point."""
import json, sys
import numpy as np, rasterio
from rasterio.windows import from_bounds
from pyproj import CRS, Transformer

R = 1737400.0
MOON = CRS.from_proj4(f"+proj=longlat +a={R} +b={R} +no_defs")
SITES = {"site_001": ("Site01", -89.45, 222.69), "site_004": ("Site04", -89.78, 204.27),
         "site_malapert": ("Site23", -85.992, 2.056)}
RADIUS_M = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
raw = sys.argv[1]
out = {}
for sid, (name, lat, lon) in SITES.items():
    with rasterio.open(f"{raw}/{name}_final_adj_5mpp_surf.tif") as ds:
        fwd = Transformer.from_crs(MOON, ds.crs, always_xy=True)
        inv = Transformer.from_crs(ds.crs, MOON, always_xy=True)
        x0, y0 = fwd.transform(lon, lat)
        win = from_bounds(x0 - RADIUS_M - 10, y0 - RADIUS_M - 10, x0 + RADIUS_M + 10, y0 + RADIUS_M + 10, ds.transform)
        z = ds.read(1, window=win, masked=True).astype(float).filled(np.nan)
        T = ds.window_transform(win)
        rows, cols = np.indices(z.shape)
        xs, ys = rasterio.transform.xy(T, rows, cols)
        xs, ys = np.asarray(xs).reshape(z.shape), np.asarray(ys).reshape(z.shape)
        d = np.hypot(xs - x0, ys - y0)
        z_in = np.where(d <= RADIUS_M, z, np.nan)
        r0, c0 = rasterio.transform.rowcol(T, x0, y0)
        i = np.nanargmax(z_in)
        rr, cc = np.unravel_index(i, z.shape)
        lon1, lat1 = inv.transform(xs[rr, cc], ys[rr, cc])
        out[sid] = {"published_elev_m": float(z[r0, c0]), "max_elev_m": float(z[rr, cc]),
                    "rise_m": float(z[rr, cc] - z[r0, c0]), "offset_m": float(d[rr, cc]),
                    "lat": float(lat1), "lon": float(lon1 % 360), "median_m": float(np.nanmedian(z_in))}
print(json.dumps(out, indent=1))
