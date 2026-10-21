"""Loads the advisor-owned YAML in content/ and the versioned prompts."""
from functools import lru_cache
from pathlib import Path

import yaml

from app.core.config import get_settings

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


@lru_cache
def load_yaml(name: str) -> dict:
    path = get_settings().CONTENT_DIR / f"{name}.yaml"
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache
def prompt(name: str) -> tuple[str, str]:
    """Returns (text, version). The version is the file name, e.g. coach_v1."""
    path = PROMPTS_DIR / f"{name}.md"
    return path.read_text(encoding="utf-8"), path.stem


def zone_names() -> dict[str, str]:
    return {z["id"]: z["name"] for z in load_yaml("zones")["zones"]}


ZONE_IDS = ["hairline", "left_temple", "right_temple", "crown", "nape"]
CONSENT_TYPES = ["health_data", "analysis", "photo_retention", "sharing", "reminders"]
