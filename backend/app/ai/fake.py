"""Deterministic stand-in for OpenAI, used when AI_MODE=fake and in tests.

It lets you click through every flow without a key. Its replies are canned and are
labelled "Demo AI" in the app. It is not a model of what the real API returns.
"""
from __future__ import annotations

import hashlib
import math
import re
import time
import uuid
from typing import Any, Callable, TypeVar

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.openai_client import DecisionAnswer, ModerationResult, log_call
from app.models import AICall

T = TypeVar("T", bound=BaseModel)

CRISIS = re.compile(r"\b(kill myself|suicid\w*|self[- ]harm\w*|end my life|hurt myself|don'?t want to live)\b", re.I)
URGENT = re.compile(r"\b(bleed\w*|pus|fever|oozing|spreading fast|sudden(ly)?|severe pain|swollen|burn(ed|t)? scalp)\b", re.I)
HAIR = re.compile(
    r"\b(hair|scalp|edges?|braid\w*|twist\w*|locs?|wig\w*|weave\w*|cornrow\w*|wash\w*|condition\w*|shampoo\w*|"
    r"relax\w*|itch\w*|flak\w*|dandruff|bumps?|tension|tight\w*|style\w*|thin\w*|breakage|heat|stylist|moisture|"
    r"take[- ]?down|install\w*|extension\w*|ponytail\w*|sore\w*|alopecia|hair ?loss|trichologist\w*|dermatologist\w*)\b",
    re.I,
)
DIAGNOSIS = re.compile(r"\byou (have|'ve got|are suffering from)\b", re.I)
STOP = set(
    "a an and are as at be but by can do does for from has have how i if in is it its my of on or so that the this to "
    "was what when where which who why will with you your me am should could would".split()
)
WORD = re.compile(r"[a-z]+")


def _stem(w: str) -> str:
    for suf in ("ing", "es", "ed", "s", "y"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def fake_embedding(text: str, dim: int = 1536) -> list[float]:
    """Hashed bag of words, L2-normalised: similar wording gives similar vectors."""
    vec = [0.0] * dim
    for w in WORD.findall(text.lower()):
        if w in STOP or len(w) < 3:
            continue
        h = int(hashlib.sha256(_stem(w).encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class FakeAI:
    is_fake = True

    def __init__(self, db: Session, user_id: uuid.UUID | None):
        self.db = db
        self.user_id = user_id

    def _log(self, feature: str, endpoint: str) -> None:
        log_call(AICall(user_id=self.user_id, feature=feature, endpoint=endpoint, model="fake", input_tokens=0,
                        output_tokens=0, latency_ms=0.0, status="fake"))

    def moderate_text(self, text: str, feature: str) -> ModerationResult:
        self._log(feature, "moderations")
        if CRISIS.search(text or ""):
            return ModerationResult(flagged=True, self_harm=True, categories=["self-harm"])
        return ModerationResult(flagged=False)

    def moderate_image(self, data_url: str, feature: str) -> ModerationResult:
        self._log(feature, "moderations")
        return ModerationResult(flagged=False)

    def decide(self, feature: str, input: Any, questions: list[dict]) -> list[DecisionAnswer]:
        self._log(feature, "decisions")
        text = input if isinstance(input, str) else _text_of(input)
        out: list[DecisionAnswer] = []
        for q in questions:
            name = q.get("name", "")
            if q["type"] == "predicate":
                p = 0.9
                if name == "hair_covers_area":
                    p = 0.1
                elif name == "tells_user_they_have_condition":
                    p = 0.9 if DIAGNOSIS.search(text) else 0.02
                out.append(DecisionAnswer(name, "predicate", probability=p))
            elif q["type"] == "choice":
                values = [c["value"] for c in q["choices"]]
                pick = values[0]
                if name == "triage":
                    if URGENT.search(text):
                        pick = "see_someone_now"
                    elif HAIR.search(text):
                        pick = "hair_scalp_care"
                    else:
                        pick = "out_of_scope"
                out.append(DecisionAnswer(name, "choice", choice=pick, confidence=0.9))
            else:
                out.append(DecisionAnswer(name, "refusal"))
        return out

    def parse(self, *, feature: str, schema: type[T], fake: Callable[[], T | None] | None = None, **_: Any) -> T | None:
        self._log(feature, "responses")
        time.sleep(0)  # keep the call shape; no delay
        return fake() if fake else None

    def embed(self, texts: list[str], feature: str = "embed") -> list[list[float]]:
        self._log(feature, "embeddings")
        return [fake_embedding(t) for t in texts]

    @property
    def embed_model(self) -> str:
        return "fake-bow-1536"


def _text_of(messages: list) -> str:
    parts = []
    for m in messages:
        c = m.get("content") if isinstance(m, dict) else None
        if isinstance(c, str):
            parts.append(c)
        elif isinstance(c, list):
            parts += [p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "input_text"]
    return " ".join(parts)
