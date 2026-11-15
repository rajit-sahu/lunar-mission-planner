"""GeoTIFF sampling with geographic transforms appropriate to lunar imagery.

No Earth geographic EPSG:4326 is used. NASA MOON_ME/DE421 map metadata
must be checked by the operator: reprojection handles maps, NOT lunar frames.
"""
from contextlib import ExitStack
from pathlib import Path
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from .geometry import MOON_RADIUS_M, great_circle_targets

MOON_GEOGRAPHIC_CRS = CRS.from_proj4(
    f"+proj=longlat +a={MOON_RADIUS_M} +b={MOON_RADIUS_M} +no_defs"
)


class RasterStack:
    """Sample highest-priority raster first, then fill uncovered points from later rasters."""

    def __init__(self, paths, crs_override=None):
        if not paths:
            raise ValueError("No elevation DEMs provided")
        self._stack = ExitStack()
        self.layers = []
        for item in paths:
            path = Path(item)
            if not path.exists():
                raise FileNotFoundError(f"Missing GeoTIFF: {path}")
            src = self._stack.enter_context(rasterio.open(path))
            crs = CRS.from_user_input(crs_override) if crs_override else src.crs
            if crs is None:
                raise ValueError(f"Missing CRS in {path}; supply --crs-override only after verifying metadata")
            if not crs.is_projected:
                raise ValueError(f"Expected lunar polar projected CRS, not {crs}")
            # Most lunar DEMs have a local planetary CRS. Reject obvious Earth datums.
            crs_text = crs.to_wkt().lower()
            if "wgs 84" in crs_text or 'epsg","4326' in crs_text:
                raise ValueError(f"Earth CRS detected in {path}; do not silently treat it as lunar")
            transformer = Transformer.from_crs(MOON_GEOGRAPHIC_CRS, crs, always_xy=True)
            self.layers.append((str(path), src, transformer))

    def close(self):
        self._stack.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def sample(self, latitudes, longitudes, return_source=False):
        """Return elevations (m). NaN means that no raster has valid coverage."""
        lat = np.asarray(latitudes, dtype=float)
        lon = np.asarray(longitudes, dtype=float)
        lat, lon = np.broadcast_arrays(lat, lon)
        out = np.full(lat.shape, np.nan)
        sources = np.full(lat.shape, -1, dtype=int)
        for idx, (_, ds, transformer) in enumerate(self.layers):
            missing = np.flatnonzero(~np.isfinite(out.ravel()) & np.isfinite(lat.ravel()) & np.isfinite(lon.ravel()))
            if not missing.size:
                break
            x, y = transformer.transform(lon.ravel()[missing], lat.ravel()[missing])
            x, y = np.asarray(x), np.asarray(y)
            inside = (np.isfinite(x) & np.isfinite(y) & (x >= ds.bounds.left) &
                      (x < ds.bounds.right) & (y > ds.bounds.bottom) & (y <= ds.bounds.top))
            if not np.any(inside):
                continue
            positions = np.column_stack((x[inside], y[inside]))
            vals = np.array([v[0] for v in ds.sample(positions, masked=True)], dtype=float)
            valid = np.isfinite(vals) & (np.abs(vals) < 30_000)
            if ds.nodata is not None and np.isfinite(ds.nodata):
                valid &= (vals != ds.nodata)
            targets = missing[inside][valid]
            out.ravel()[targets] = vals[valid]
            sources.ravel()[targets] = idx
        return (out, sources) if return_source else out


def sample_local_slope(stack, latitude_deg, longitude_deg, baseline_m=50):
    """Central differences in locally orthogonal E and N directions.

    This is the smoothed slope over a declared baseline, not hazard-scale slope.
    """
    if baseline_m <= 0:
        raise ValueError("baseline_m must be positive")
    half = baseline_m / 2
    az = np.array([90.0, 270.0, 0.0, 180.0])
    lat, lon, _ = great_circle_targets(latitude_deg, longitude_deg, az, half)
    z = stack.sample(lat, lon)
    if not np.all(np.isfinite(z)):
        return None
    east_gradient = (z[0] - z[1])/baseline_m
    north_gradient = (z[2] - z[3])/baseline_m
    return float(np.degrees(np.arctan(np.hypot(east_gradient, north_gradient))))
