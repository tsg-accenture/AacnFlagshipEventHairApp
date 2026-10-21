from __future__ import annotations

import uuid
from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.openai_client import AIUnavailable, get_ai
from app.core.db import get_db
from app.core.ratelimit import check_ai_limits
from app.core.security import current_user
from app.models import User


def make_ai(db: Session, user_id: uuid.UUID | None) -> Any:
    try:
        return get_ai(db, user_id)
    except AIUnavailable as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, {"code": "ai_unavailable", "message": str(e)}) from e


def ai_for_user(db: Session = Depends(get_db), user: User = Depends(current_user)) -> Any:
    """AI client for a signed-in user, after rate limits and the monthly cap."""
    check_ai_limits(db, user)
    return make_ai(db, user.id)


def parse_uuid(value: str, what: str = "Item") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found") from None


def moderate_or_raise(db: Session, user: User, text: str | None, feature: str) -> dict | None:
    """Screens free text with Moderations. Returns the fixed support reply if self-harm is flagged.

    Free-text fields need the moderation service, so with AI_MODE=openai and no key
    they return 503 and the app hides them.
    """
    from app.ai.moderate import check_text

    if not text or not text.strip():
        return None
    check_ai_limits(db, user)
    ai = make_ai(db, user.id)
    chk = check_text(ai, text, feature)
    if chk.support:
        return chk.support
    if not chk.allowed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, chk.message)
    return None
