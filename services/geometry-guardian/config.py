import json
import os
from pathlib import Path


def load_geometry_config() -> dict:
    """Load geometry config from project root config/geometry.json"""
    # Go up from services/geometry-guardian/ to project root
    config_path = Path(__file__).parent.parent.parent / "config" / "geometry.json"
    if not config_path.exists():
        return get_defaults()
    with open(config_path) as f:
        return json.load(f)


def get_defaults() -> dict:
    return {
        "translationThresholdPct": 1.5,
        "rotationThresholdDeg": 0.5,
        "scaleThresholdPct": 2.0,
        "perspectiveDriftMax": 0.03,
        "passScore": 0.94,
        "reviewScore": 0.88,
        "failScore": 0.88,
        "featureMatchMinInliers": 40,
        "cannyLow": 50,
        "cannyHigh": 150,
        "houghThreshold": 80,
        "houghMinLineLength": 100,
        "houghMaxLineGap": 10,
        "lightGlueEnabled": False,
        "debugOverlay": True,
        "debugOverlayOpacity": 0.5,
    }


CONFIG = load_geometry_config()
