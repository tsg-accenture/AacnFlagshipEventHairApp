"""Photo steps (Phase 3): quality gate with Decisions, then a structured description with Responses.

The output schema has no field for a diagnosis or condition name.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from app.ai.openai_client import predicate
from app.content import prompt, zone_names
from app.core.config import get_settings

Seen = Literal["visible", "not_visible", "cant_tell"]
SIGNS = ["short_broken_hairs", "looks_thinner", "flaking", "build_up", "bumps_or_spots"]


class ZoneObservation(BaseModel):
    short_broken_hairs: Seen
    looks_thinner: Seen
    flaking: Seen
    build_up: Seen
    bumps_or_spots: Seen


def quality_check(ai: Any, data_url: str, zone: str) -> dict:
    """Never blocks: returns issues the app can show with Retake / Use anyway."""
    name = zone_names().get(zone, zone)
    questions = [
        predicate("zone_visible", f"The photo clearly shows the scalp area: {name}."),
        predicate("in_focus", "The photo is in focus, not blurry."),
        predicate("well_lit", "The photo is well lit: not too dark and not washed out."),
        predicate("hair_covers_area", "Hair, a wig, a scarf or a hairstyle covers most of the scalp in this area."),
    ]
    message = [{"type": "message", "role": "user", "content": [
        {"type": "input_text", "text": f"A close-up photo of the {name} for a hair-care app."},
        {"type": "input_image", "image_url": data_url, "detail": "low"},
    ]}]
    answers = {a.name: a for a in ai.decide("photo_quality", message, questions)}
    issues = []

    def prob(n: str) -> float | None:
        a = answers.get(n)
        return a.probability if a and a.type == "predicate" else None

    if (p := prob("zone_visible")) is not None and p < 0.5:
        issues.append({"id": "zone_not_visible", "text": f"We can't clearly see your {name.lower()}."})
    if (p := prob("in_focus")) is not None and p < 0.5:
        issues.append({"id": "blurry", "text": "The photo looks blurry."})
    if (p := prob("well_lit")) is not None and p < 0.5:
        issues.append({"id": "lighting", "text": "The lighting makes it hard to see. Try facing a window."})
    if (p := prob("hair_covers_area")) is not None and p >= 0.5:
        issues.append({"id": "covered", "text": "Hair or a style covers most of this area."})
    return {"ok": not issues, "issues": issues, "checked": bool(answers)}


def describe(ai: Any, data_url: str, zone: str) -> tuple[ZoneObservation | None, str, str]:
    """Returns (observation or None, model, prompt_version)."""
    s = get_settings()
    text, version = prompt("observe_v1")
    name = zone_names().get(zone, zone)
    inp = [{"role": "user", "content": [
        {"type": "input_text", "text": f"Zone: {name}. Describe only what is visible in this photo."},
        {"type": "input_image", "image_url": data_url, "detail": "high"},
    ]}]

    def fake() -> ZoneObservation:
        return ZoneObservation(short_broken_hairs="not_visible", looks_thinner="cant_tell", flaking="not_visible",
                               build_up="not_visible", bumps_or_spots="not_visible")

    obs = ai.parse(
        feature="photo_observe", model=s.OPENAI_MODEL_VISION, instructions=text, input=inp, schema=ZoneObservation,
        max_output_tokens=600, effort=s.OPENAI_REASONING_EFFORT_VISION, fake=fake,
    )
    model = "fake" if getattr(ai, "is_fake", False) else s.OPENAI_MODEL_VISION
    return obs, model, version
