import json


def load_arnav_terrain(path, require_complete=True):
    """
    Convert Arnav's terrain JSON into the format expected
    by the science pipeline.

    require_complete=True rejects missing horizon values.
    """

    with open(path, "r") as file:
        terrain = json.load(file)

    horizon = terrain["terrain_horizon"]

    if len(horizon) != 360:
        raise ValueError("Expected 360 horizon bins.")

    azimuths = []
    elevations = []

    for index, point in enumerate(horizon):

        azimuth = point["azimuth_deg"]
        elevation = point["elevation_deg"]

        if azimuth != index:
            raise ValueError(
                f"Unexpected azimuth at index {index}: {azimuth}"
            )

        if elevation is None and require_complete:
            raise ValueError(
                f"Missing terrain horizon at azimuth {azimuth}°."
            )

        azimuths.append(azimuth)
        elevations.append(elevation)

    quality = terrain.get("quality", {})

    if require_complete:
        if not quality.get("horizon_samples_are_complete", False):
            raise ValueError(
                "Terrain horizon sampling is incomplete."
            )

    observer_height_m = terrain.get("observer_height_m", 2.0)

    elevation_km = (
        terrain["elevation_m"] + observer_height_m
    ) / 1000.0

    return {
        "site_id": terrain["site_id"],
        "latitude_deg": terrain["latitude_deg"],
        "longitude_deg": terrain["longitude_deg"],
        "elevation_km": elevation_km,
        "horizon_azimuths": azimuths,
        "horizon_elevations": elevations
    }