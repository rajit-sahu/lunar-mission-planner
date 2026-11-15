#!/bin/sh
# Regenerate the horizon files the backend ships (data/processed/*_terrain*.json)
# exactly as they were made: 2, 5 and 10 m observer heights, 160 km range,
# 5 rays per 1-degree bin, all three 5 m site DEMs plus the 80 m polar DEM.
#
# Run from Terrain/ with the terrain environment (rasterio, pyproj):
#   RAW=/path/to/data/raw sh scripts/regenerate_shipped.sh
# RAW must hold Site01/04/23 *_final_adj_5mpp_surf.tif and *_slp.tif and
# LDEM_80S_80MPP_ADJ.TIF (see "Data" above). Takes ~30-60 min.
#
# Site points come from ../config/sites.json: published points, plus
# site_004_crest, the crest found by `python scripts/find_crest.py $RAW 100`
# (highest 5 m cell within 100 m of Shackleton Rim's published point).
set -e
RAW=${RAW:-data/raw}
OUT=${OUT:-out}
PY=${PY:-python}
for H in 2 5 10; do
  mkdir -p "$OUT/h$H"
  $PY -m science.terrain.cli --sites-json ../config/sites.json \
    --observer-height-m $H --max-distance-km 160 --subrays-per-bin 5 \
    --output-dir "$OUT/h$H" --plots-dir "$OUT/h$H" \
    --site site_001 --site site_004 --site site_004_crest --site site_malapert \
    --dem "$RAW/Site01_final_adj_5mpp_surf.tif" --dem "$RAW/Site04_final_adj_5mpp_surf.tif" \
    --dem "$RAW/Site23_final_adj_5mpp_surf.tif" --dem "$RAW/LDEM_80S_80MPP_ADJ.TIF" \
    --slope-map "site_001=$RAW/Site01_final_adj_5mpp_slp.tif" \
    --slope-map "site_004=$RAW/Site04_final_adj_5mpp_slp.tif" \
    --slope-map "site_004_crest=$RAW/Site04_final_adj_5mpp_slp.tif" \
    --slope-map "site_malapert=$RAW/Site23_final_adj_5mpp_slp.tif"
  for S in site_001 site_004 site_004_crest site_malapert; do
    if [ "$H" = 2 ]; then DST=../data/processed/${S}_terrain.json; else DST=../data/processed/${S}_terrain_h$H.json; fi
    cp "$OUT/h$H/${S}_terrain.json" "$DST"
  done
done
echo "Done. Note: source paths inside the JSON are whatever RAW was; the shipped files use data/raw/..."
