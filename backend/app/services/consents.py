from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import CONSENT_TYPES, load_yaml
from app.models import ConsentEvent


def current(db: Session, user_id: uuid.UUID) -> dict[str, dict]:
    rows = db.scalars(
        select(ConsentEvent).where(ConsentEvent.user_id == user_id).order_by(ConsentEvent.created_at)
    ).all()
    state: dict[str, dict] = {t: {"granted": False, "at": None, "wording_version": None} for t in CONSENT_TYPES}
    for r in rows:  # later events overwrite earlier ones
        state[r.consent_type] = {"granted": r.granted, "at": r.created_at.isoformat(), "wording_version": r.wording_version}
    return state


def has(db: Session, user_id: uuid.UUID, consent_type: str) -> bool:
    row = db.scalars(
        select(ConsentEvent)
        .where(ConsentEvent.user_id == user_id, ConsentEvent.consent_type == consent_type)
        .order_by(ConsentEvent.created_at.desc())
        .limit(1)
    ).first()
    return bool(row and row.granted)


def record(db: Session, user_id: uuid.UUID, consent_type: str, granted: bool, source: str) -> datetime:
    if consent_type not in CONSENT_TYPES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown consent type")
    ev = ConsentEvent(
        user_id=user_id, consent_type=consent_type, granted=granted,
        wording_version=load_yaml("consents")["version"], source=source,
    )
    db.add(ev)
    db.commit()
    return ev.created_at


def require(db: Session, user_id: uuid.UUID, consent_type: str) -> None:
    if not has(db, user_id, consent_type):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {"code": "consent_required", "consent": consent_type,
             "message": f"This needs your OK first: {load_yaml('consents')['consents'][consent_type]['title']}."},
        )
