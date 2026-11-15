"""Viewpoints for the frontend's "Street View on the Moon".

For each site: the landing point (horizon reused from data/processed so it
matches the backend exactly), a ring of points around it, and the highest
and lowest ground nearby. Each gets a real LOLA 360-degree horizon from the
same pipeline the backend uses, plus a hillshade minimap of the area.

Run from Terrain/ with the terrain environment (rasterio, pyproj, matplotlib):

    python -m scripts.streetview_points --raw /path/to/data/raw \
        --out ../Frontend/public/streetview

Needs the 5 m site DEMs + slope maps and LDEM_80S_80MPP_ADJ.TIF (see README).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from matplotlib import image as mpimg
from pyproj import CRS, Transformer
from rasterio.windows import from_bounds

from science.terrain.dem import RasterStack, sample_local_slope
from science.terrain.geometry import MOON_RADIUS_M, great_circle_targets
from science.terrain.horizon import calculate_horizon

REPO = Path(__file__).resolve().parents[2]
SITES = {"site_001": "Site01", "site_004": "Site04", "site_004_crest": "Site04", "site_malapert": "Site23"}
# Extra named viewpoints (kept even when close to the landing point).
EXTRA = {
    "site_004": [("crest", "Crest near Site 004 (54 m)", -89.78033, 203.81414)],
    "site_004_crest": [("published", "Site 004 published point (54 m)", -89.78, 204.27)],
}
RING_M = 400          # ring of viewpoints around the landing point
RING_N = 8
SEARCH_M = 1500       # radius for the highest / lowest ground
MAP_HALF_M = 1700     # minimap covers +/- this around the landing point
MAP_PX = 680
NEIGHBOUR_M = 900     # points closer than this are linked by arrows
OBSERVER_M = 2.0
MOON_GEO = CRS.from_proj4(f"+proj=longlat +a={MOON_RADIUS_M} +b={MOON_RADIUS_M} +no_defs")
CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def gc_distance_bearing(lat1, lon1, lat2, lon2):
    """Great-circle distance (m) and initial bearing (deg, clockwise from local north)."""
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    c = np.arccos(np.clip(np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(dl), -1, 1))
    b = np.degrees(np.arctan2(np.sin(dl) * np.cos(p2), np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)))
    return float(c * MOON_RADIUS_M), float(b % 360)


def hillshade(z, cell_m, az_deg=315.0, alt_deg=35.0):
    gy, gx = np.gradient(z, cell_m)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(az_deg), np.radians(alt_deg)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, help="Folder with the NASA GeoTIFFs")
    ap.add_argument("--out", required=True)
    ap.add_argument("--site", action="append")
    ap.add_argument("--subrays", type=int, default=3)
    ap.add_argument("--max-distance-km", type=float, default=160)
    args = ap.parse_args()
    raw, out = Path(args.raw), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    sites = {s["id"]: s for s in json.loads((REPO / "config" / "sites.json").read_text())}

    for site_id in args.site or SITES:
        site = sites[site_id]
        own = raw / f"{SITES[site_id]}_final_adj_5mpp_surf.tif"
        others = [raw / f"{v}_final_adj_5mpp_surf.tif" for v in dict.fromkeys(SITES.values()) if v != SITES[site_id]]
        dems = [own, *others, raw / "LDEM_80S_80MPP_ADJ.TIF"]
        lat0, lon0 = site["latitude_deg"], site["longitude_deg"] % 360
        centre_file = json.loads((REPO / "data" / "processed" / f"{site_id}_terrain.json").read_text())

        with RasterStack(dems) as stack, RasterStack([raw / f"{SITES[site_id]}_final_adj_5mpp_slp.tif"]) as slp, rasterio.open(own) as ds:
            fwd = Transformer.from_crs(MOON_GEO, ds.crs, always_xy=True)
            inv = Transformer.from_crs(ds.crs, MOON_GEO, always_xy=True)
            x0, y0 = fwd.transform(lon0, lat0)

            # ---- minimap: hillshade of the 5 m DEM around the landing point
            win = from_bounds(x0 - MAP_HALF_M, y0 - MAP_HALF_M, x0 + MAP_HALF_M, y0 + MAP_HALF_M, ds.transform)
            z = ds.read(1, window=win, masked=True).astype(float).filled(np.nan)
            T = ds.window_transform(win)
            cell = abs(T.a)
            zf = np.where(np.isfinite(z), z, np.nanmedian(z))
            shade = hillshade(zf, cell)
            idx = np.linspace(0, shade.shape[0] - 1, MAP_PX).astype(int)
            jdx = np.linspace(0, shade.shape[1] - 1, MAP_PX).astype(int)
            img = (0.18 + 0.82 * shade[np.ix_(idx, jdx)]) * 255
            mpimg.imsave(out / f"{site_id}_map.png", np.dstack([img, img, img]).astype(np.uint8))

            def to_px(lat, lon):
                x, y = fwd.transform(lon, lat)
                return ((x - (x0 - MAP_HALF_M)) / (2 * MAP_HALF_M) * MAP_PX, ((y0 + MAP_HALF_M) - y) / (2 * MAP_HALF_M) * MAP_PX)

            def north_deg(lat, lon):
                """Direction of local north on the minimap, clockwise from image up."""
                ax, ay = to_px(lat, lon)
                bx, by = to_px(min(lat + 0.0005, 89.999), lon)
                return float(np.degrees(np.arctan2(bx - ax, -(by - ay))) % 360)

            # ---- candidate viewpoints
            pts = [{"id": "landing", "label": "Landing point", "lat": lat0, "lon": lon0}]
            lats, lons, _ = great_circle_targets(lat0, lon0, np.arange(RING_N) * 360 / RING_N, RING_M)
            for k, (la, lo) in enumerate(zip(lats, lons)):
                pts.append({"id": f"ring{k}", "label": f"{RING_M} m {CARD[k]}", "lat": float(la), "lon": float(lo)})

            # highest / lowest ground within SEARCH_M (on the 5 m map)
            w2 = from_bounds(x0 - SEARCH_M, y0 - SEARCH_M, x0 + SEARCH_M, y0 + SEARCH_M, ds.transform)
            z2 = ds.read(1, window=w2, masked=True).astype(float).filled(np.nan)
            T2 = ds.window_transform(w2)
            rr, cc = np.indices(z2.shape)
            xs, ys = rasterio.transform.xy(T2, rr.ravel(), cc.ravel())
            xs, ys = np.asarray(xs).reshape(z2.shape), np.asarray(ys).reshape(z2.shape)
            inside = np.hypot(xs - x0, ys - y0) <= SEARCH_M
            zc = np.where(inside, z2, np.nan)
            z_land = float(stack.sample([lat0], [lon0])[0])
            for kind, fn in (("high", np.nanargmax), ("low", np.nanargmin)):
                i = np.unravel_index(fn(zc), zc.shape)
                lo, la = inv.transform(xs[i], ys[i])
                dz = float(zc[i] - z_land)
                label = f"Highest ground nearby (+{dz:.0f} m)" if kind == "high" else f"Lowest ground nearby ({dz:.0f} m)"
                pts.append({"id": kind, "label": label, "lat": float(la), "lon": float(lo % 360)})

            # drop near-duplicates (e.g. landing point already on the crest)
            kept = []
            for p in pts:
                if all(gc_distance_bearing(p["lat"], p["lon"], q["lat"], q["lon"])[0] > 120 for q in kept):
                    kept.append(p)
            pts = kept
            for pid, label, la, lo in EXTRA.get(site_id, []):
                pts.append({"id": pid, "label": label, "lat": la, "lon": lo % 360})

            # ---- horizons, elevation, slope
            for p in pts:
                p["elevation_m"] = round(float(stack.sample([p["lat"]], [p["lon"]])[0]), 1)
                s = float(slp.sample([p["lat"]], [p["lon"]])[0])
                p["slope_deg"] = round(s, 1) if np.isfinite(s) else sample_local_slope(stack, p["lat"], p["lon"])
                if p["id"] == "landing":
                    rows = sorted(centre_file["terrain_horizon"], key=lambda r: r["azimuth_deg"])
                    h = [r["elevation_deg"] for r in rows]
                else:
                    res = calculate_horizon(stack, p["lat"], p["lon"], p["elevation_m"], observer_height_m=OBSERVER_M,
                                            max_distance_m=args.max_distance_km * 1000, subrays_per_bin=args.subrays)
                    h = [float(v) for v in res["elevation_angles"]]
                    if not all(np.isfinite(h)):
                        raise RuntimeError(f"{site_id}/{p['id']}: horizon has gaps")
                p["horizon"] = [round(v, 3) for v in h]
                d, b = gc_distance_bearing(lat0, lon0, p["lat"], p["lon"])
                p["distance_m"], p["bearing_from_landing_deg"] = round(d), round(b, 1)
                p["dz_m"] = round(p["elevation_m"] - z_land, 1)
                px, py = to_px(p["lat"], p["lon"])
                p["map_px"] = [round(px, 1), round(py, 1)]
                p["map_north_deg"] = round(north_deg(p["lat"], p["lon"]), 2)
                print(f"  {site_id}/{p['id']}: z={p['elevation_m']} m, max horizon {max(h):.2f} deg", flush=True)

            # ---- arrows between nearby points (every point linked at least to its nearest)
            for p in pts:
                links = []
                for q in pts:
                    if q is p:
                        continue
                    d, b = gc_distance_bearing(p["lat"], p["lon"], q["lat"], q["lon"])
                    links.append({"to": q["id"], "distance_m": round(d), "bearing_deg": round(b, 1)})
                links.sort(key=lambda l: l["distance_m"])
                p["links"] = [l for l in links if l["distance_m"] <= NEIGHBOUR_M] or links[:1]

        doc = {
            "site_id": site_id,
            "observer_height_m": OBSERVER_M,
            "map": {"file": f"{site_id}_map.png", "size_px": MAP_PX, "half_extent_m": MAP_HALF_M},
            "method": f"LOLA 5 m + 80 m DEMs, {args.subrays} rays per 1-degree bin, {args.max_distance_km:g} km range; "
                      "landing point horizon identical to data/processed",
            "points": pts,
        }
        (out / f"{site_id}.json").write_text(json.dumps(doc, separators=(",", ":")))
        print(f"wrote {site_id}: {len(pts)} points", flush=True)


if __name__ == "__main__":
    main()
