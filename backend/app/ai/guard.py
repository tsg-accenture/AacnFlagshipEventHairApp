"""Output checks: banned-phrase list, a Decisions predicate, and the citation validator."""
from __future__ import annotations

import re
from typing import Any

from app.ai.openai_client import predicate

CONDITIONS = (
    r"(traction alopecia|alopecia|ccca|central centrifugal|cicatricial|scarring hair loss|seborrh\w+ dermatitis|"
    r"dermatitis|psoriasis|tinea( capitis)?|ringworm|folliculitis|lupus|eczema|an? (fungal |bacterial )?infection|"
    r"cancer|frontal fibrosing|lichen planopilaris)"
)
HEDGE = r"(?:may|might|could|probably|likely|possibly|definitely|clearly|seem to|appear to)"
BANNED = [
    re.compile(rf"\byou(?:'ve| have)? (?:got |have |are suffering from |suffer from |are developing |show signs of |have signs of )?{CONDITIONS}\b", re.I),
    re.compile(rf"\byou {HEDGE} (?:have|be developing|be showing signs of|be suffering from) {CONDITIONS}\b", re.I),
    re.compile(rf"\b(?:this|it|that|these|they) (?:is|are|looks? like|sounds? like|could be|might be|may be|seems? like|appears? to be|suggests?|indicates?|points? to|is consistent with|are consistent with|matches) (?:early |possible |signs of |a sign of )?{CONDITIONS}\b", re.I),
    re.compile(rf"\b(?:consistent with|suggestive of|indicative of) {CONDITIONS}\b", re.I),
    re.compile(r"\b(?:diagnos\w+|confirm\w*) (?:that )?you\b", re.I),
    re.compile(r"\byour diagnosis\b", re.I),
    re.compile(r"\b(?:will|guaranteed? to) (?:cure|regrow|reverse)\b", re.I),
]


def banned_phrase(text: str) -> str | None:
    for pat in BANNED:
        m = pat.search(text or "")
        if m:
            return m.group(0)
    return None


def wording_ok(ai: Any, feature: str, texts: list[str]) -> bool:
    """True if no banned phrase and the Decisions check says no diagnosis is given."""
    joined = "\n".join(t for t in texts if t)
    if not joined.strip():
        return True
    if banned_phrase(joined):
        return False
    answers = ai.decide(
        f"{feature}:wording",
        joined,
        [predicate("tells_user_they_have_condition",
                   "This text tells the reader that they personally have a specific medical condition, or diagnoses them.")],
    )
    a = answers[0]
    if a.type == "refusal" or a.probability is None:
        return False
    return a.probability < 0.5


def valid_citations(cited: list[int], allowed: set[int]) -> bool:
    """Every cited id must be one of the reviewed passages we sent. An answer citing nothing is invalid."""
    return bool(cited) and all(c in allowed for c in cited)
