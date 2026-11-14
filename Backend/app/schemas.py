"""The shared JSON format. These models are what the frontend receives.

Conventions (from the project plan): times are UTC ISO 8601 ending in "Z";
latitude is degrees north-positive; longitude is degrees east-positive;
azimuth is degrees clockwise from north in [0, 360); elevation is degrees
above the local horizontal; distances are kilometres.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Source = Literal["placeholder", "spice", "lola"]


class Site(BaseModel):
    id: str
    name: str
    latitude_deg: float
    longitude_deg: float
    elevation_km: float
    placeholder: bool


class BodyState(BaseModel):
    azimuth_deg: float
    elevation_deg: float
    distance_km: float
    horizon_elevation_deg: float  # terrain horizon at this body's azimuth
    visible: bool


class Position(BaseModel):
    site_id: str
    time: str
    ephemeris_source: Source
    terrain_source: Source
    sun: BodyState
    earth: BodyState
    both_visible: bool


class BodySeries(BaseModel):
    azimuth_deg: list[float]
    elevation_deg: list[float]
    visible: list[bool]


class Samples(BaseModel):
    """Column-oriented so each list can go straight into a Plotly trace."""

    time: list[str]
    sun: BodySeries
    earth: BodySeries
    both_visible: list[bool]


class Window(BaseModel):
    """A stretch of continuous visibility, accurate to one time step.

    end is the first sample where the body is blocked again, or the end of
    the requested range when it is still visible there.
    """

    start: str
    end: str


class Windows(BaseModel):
    sun: list[Window]
    earth: list[Window]
    both: list[Window]


class Timeline(BaseModel):
    site_id: str
    start: str
    end: str
    step_minutes: int
    ephemeris_source: Source
    terrain_source: Source
    samples: Samples
    windows: Windows


class Horizon(BaseModel):
    site_id: str
    terrain_source: Source
    azimuth_deg: list[float]
    horizon_elevation_deg: list[float]
