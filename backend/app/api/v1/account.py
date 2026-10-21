"""Auth, account, consents (Phase 0)."""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import storage
from app.content import CONSENT_TYPES, load_yaml
from app.core.db import get_db
from app.core.security import current_user, end_session, hash_password, start_session, verify_password
from app.models import (
    AuditLog, Assessment, CarePack, CarePlan, CheckIn, CoachMessage, ConsentEvent, Goal, Observation, Photo,
    Profile, Reminder, StylePeriod, StylistNote, User, ZoneState,
)
from app.services import consents

router = APIRouter()


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=10, max_length=200)
    display_name: str | None = Field(default=None, max_length=80)
    confirm_adult: bool

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@") or " " in v:
            raise ValueError("Enter a valid email address")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


def user_dict(db: Session, u: User) -> dict:
    p = db.get(Profile, u.id)
    return {
        "id": str(u.id), "email": u.email, "display_name": u.display_name, "role": u.role,
        "onboarded": bool(p and p.onboarding_completed_at), "consents": consents.current(db, u.id),
    }


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> dict:
    if not body.confirm_adult:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Crown AI is for adults (18+) at launch.")
    if db.scalars(select(User).where(User.email == body.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try signing in.")
    u = User(email=body.email, password_hash=hash_password(body.password),
             display_name=(body.display_name or "").strip() or None, adult_confirmed_at=datetime.now(timezone.utc))
    db.add(u)
    db.commit()
    db.add(AuditLog(user_id=u.id, action="register"))
    db.commit()
    start_session(db, u, response)
    return user_dict(db, u)


@router.post("/auth/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> dict:
    u = db.scalars(select(User).where(User.email == body.email.strip().lower())).first()
    if u is None or not verify_password(body.password, u.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")
    start_session(db, u, response)
    return user_dict(db, u)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    end_session(db, request, response)
    return {"ok": True}


@router.get("/me")
def me(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    return user_dict(db, user)


@router.get("/me/export")
def export(db: Session = Depends(get_db), user: User = Depends(current_user)) -> StreamingResponse:
    """Everything Crown AI holds about you, as a zip: data.json plus your kept photos."""

    def rows(model, order=None):
        stmt = select(model).where(model.user_id == user.id)
        return db.scalars(stmt).all()

    def dump(obj) -> dict:
        out = {}
        for c in obj.__table__.columns:
            v = getattr(obj, c.key)
            if c.key in ("password_hash", "embedding"):
                continue
            out[c.key] = v.isoformat() if hasattr(v, "isoformat") else (str(v) if hasattr(v, "hex") else v)
        return out

    assessments = rows(Assessment)
    a_ids = [a.id for a in assessments]
    data = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": dump(user),
        "profile": dump(db.get(Profile, user.id)) if db.get(Profile, user.id) else None,
        "consent_events": [dump(r) for r in rows(ConsentEvent)],
        "goals": [dump(r) for r in rows(Goal)],
        "reminders": [dump(r) for r in rows(Reminder)],
        "style_periods": [dump(r) for r in rows(StylePeriod)],
        "checkins": [dump(r) for r in rows(CheckIn)],
        "assessments": [dump(r) | {"zones": [dump(z) for z in r.zones]} for r in assessments],
        "observations": [dump(o) for o in db.scalars(select(Observation).where(Observation.assessment_id.in_(a_ids))).all()] if a_ids else [],
        "zone_states": [dump(r) for r in rows(ZoneState)],
        "photos": [dump(r) for r in rows(Photo)],
        "care_plans": [dump(r) for r in rows(CarePlan)],
        "coach_messages": [dump(r) for r in rows(CoachMessage)],
        "care_packs": [dump(r) for r in rows(CarePack)],
        "stylist_notes": [dump(r) for r in rows(StylistNote)],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(data, indent=2, default=str))
        for ph in rows(Photo):
            if ph.storage_key:
                try:
                    z.writestr(f"photos/{ph.zone}-{ph.created_at.strftime('%Y%m%d')}-{ph.id}.jpg", storage.load(ph.storage_key))
                except FileNotFoundError:
                    pass
    buf.seek(0)
    db.add(AuditLog(user_id=user.id, action="export"))
    db.commit()
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="crown-ai-export.zip"'})


@router.delete("/me")
def delete_me(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    """Deletes the account, every row it owns (ON DELETE CASCADE) and every stored photo file."""
    for ph in db.scalars(select(Photo).where(Photo.user_id == user.id)).all():
        storage.delete(ph.storage_key)
    storage.delete_user_dir(user.id)
    end_session(db, request, response)
    db.execute(delete(User).where(User.id == user.id))
    db.add(AuditLog(user_id=None, action="account_deleted"))
    db.commit()
    return {"deleted": True}


# ----- Consents -----

class ConsentIn(BaseModel):
    granted: bool
    source: str = Field(default="settings", max_length=40)


@router.get("/consents")
def get_consents(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    return {"state": consents.current(db, user.id), "receipt": load_yaml("consents")}


@router.put("/consents/{consent_type}")
def put_consent(consent_type: str, body: ConsentIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    if consent_type not in CONSENT_TYPES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown consent type")
    at = consents.record(db, user.id, consent_type, body.granted, body.source)
    deleted = 0
    if consent_type == "photo_retention" and not body.granted:
        # Withdrawing retention deletes kept photo files now.
        for ph in db.scalars(select(Photo).where(Photo.user_id == user.id, Photo.storage_key.is_not(None))).all():
            storage.delete(ph.storage_key)
            ph.storage_key, ph.file_deleted_at = None, datetime.now(timezone.utc)
            deleted += 1
        db.commit()
    return {"consent": consent_type, "granted": body.granted, "at": at.isoformat(), "photos_deleted": deleted}
