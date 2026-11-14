"""Candidate landing sites, read from Arnav's config/sites.json.

Longitudes there are degrees east in [0, 360). Elevation and slope are not
in the config: they come from each site's processed terrain file (see
science.py) once it exists.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SITES = {
    site["id"]: site
    for site in json.loads((REPO_ROOT / "config" / "sites.json").read_text(encoding="utf-8"))
}
