"""Moderation on every free-text input, with the fixed crisis reply."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.content import load_yaml


@dataclass
class TextCheck:
    allowed: bool
    support: dict | None = None  # the fixed, advisor-approved support message when self-harm is flagged
    message: str | None = None


def support_reply() -> dict:
    s = load_yaml("support")
    return {"message": s["message"].strip(), "links": s["links"]}


def check_text(ai: Any, text: str, feature: str) -> TextCheck:
    if not text or not text.strip():
        return TextCheck(True)
    r = ai.moderate_text(text, feature)
    if r.self_harm:
        return TextCheck(False, support=support_reply())
    if r.flagged:
        return TextCheck(False, message="We can't save or answer that message. Please rephrase it.")
    return TextCheck(True)
