"""Crown Map checks and photos (Phase 3). AI describes; rules decide."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.ai.explain import explain_zone
from app.ai.observe import describe, quality_check
from app.api.deps import ai_for_user, parse_uuid
from app.content import ZONE_IDS, load_yaml, zone_names
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_user
from app.models import Assessment, AssessmentZone, Observation, Photo, User, ZoneState
from app.rules.engine import active_rules
from app.services import consents, escalation
from app.services.rhythm import active_period

router = APIRouter()
Zone = Literal["hairline", "left_temple", "right_temple", "crown", "nape"]
ANSWER_FIELDS = {"tender", "change", "itch", "bumps"}


class AssessmentIn(BaseModel):
    kind: Literal["check", "take_down"] = "check"
    zones: list[Zone] = Field(min_length=1, max_length=5)
    answers: dict[Zone, dict[str, str]] = Field(default_factory=dict)


def _owned(db: Session, user: User, assessment_id: str) -> Assessment:
    a = db.get(Assessment, parse_uuid(assessment_id, "Check"))
    if a is None or a.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check not found")
    return a


def _validate_answers(answers: dict[str, dict[str, str]]) -> None:
    allowed = {q["field"]: [o[0] for o in q["options"]] for q in load_yaml("zones")["questions"]}
    for zone, ans in answers.items():
        for k, v in ans.items():
            if k not in ANSWER_FIELDS or v not in allowed[k]:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unexpected answer for {zone}: {k}={v}")


@router.post("/assessments", status_code=201)
def create_assessment(body: AssessmentIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    consents.require(db, user.id, "health_data")
    _validate_answers(body.answers)
    zones = list(dict.fromkeys(body.zones))
    # Starting a new check discards any unfinished one, so abandoned photos don't linger.
    for old in db.scalars(select(Assessment).where(Assessment.user_id == user.id, Assessment.status == "draft")).all():
        _discard(db, old)
    period = active_period(db, user.id)
    a = Assessment(user_id=user.id, kind=body.kind, style_period_id=period.id if period else None)
    for i, z in enumerate(zones):
        a.zones.append(AssessmentZone(zone=z, position=i, answers=body.answers.get(z, {})))
    db.add(a)
    db.commit()
    return detail(db, a)


@router.post("/assessments/{assessment_id}/photos", status_code=201)
async def upload_photo(
    assessment_id: str,
    zone: Zone = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    ai: Any = Depends(ai_for_user),
) -> dict:
    consents.require(db, user.id, "analysis")
    a = _owned(db, user, assessment_id)
    if a.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "This check has already run. Start a new one to add photos.")
    if zone not in [z.zone for z in a.zones]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That zone isn't part of this check.")
    limit = get_settings().MAX_UPLOAD_MB * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Photos must be under {get_settings().MAX_UPLOAD_MB} MB.")
    try:
        data, w, h = storage.reencode(raw)
    except storage.BadImage as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    data_url = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    mod = ai.moderate_image(data_url, "photo_upload")
    if mod.flagged:
        # Not stored. Neutral wording on purpose.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "We couldn't use that photo. Please try a different one.")
    quality = quality_check(ai, data_url, zone)
    # The photo is described now, while we have it. Without the retention consent the file is
    # never written to storage: only the description and the photo's size are kept.
    obs, model, version = describe(ai, data_url, zone)
    keep = consents.has(db, user.id, "photo_retention")
    # A retake replaces the earlier photo and description of the same zone.
    for old in db.scalars(select(Photo).where(Photo.assessment_id == a.id, Photo.zone == zone)).all():
        storage.delete(old.storage_key)
        db.delete(old)
    for old_obs in db.scalars(select(Observation).where(Observation.assessment_id == a.id, Observation.zone == zone)).all():
        db.delete(old_obs)
    db.flush()
    now = datetime.now(timezone.utc)
    ph = Photo(user_id=user.id, assessment_id=a.id, zone=zone, storage_key=storage.save(user.id, data) if keep else None,
               width=w, height=h, size_bytes=len(data), quality=quality, file_deleted_at=None if keep else now)
    db.add(ph)
    db.flush()
    if obs is not None:
        db.add(Observation(assessment_id=a.id, photo_id=ph.id, zone=zone, data=obs.model_dump(), model=model, prompt_version=version))
    db.commit()
    return {"photo_id": str(ph.id), "zone": zone, "quality": quality, "kept": keep, "described": obs is not None,
            "demo_ai": bool(getattr(ai, "is_fake", False))}


def _discard(db: Session, a: Assessment) -> None:
    for ph in db.scalars(select(Photo).where(Photo.assessment_id == a.id)).all():
        storage.delete(ph.storage_key)
    db.delete(a)  # photos, observations, zones and states cascade
    db.commit()


@router.delete("/assessments/{assessment_id}")
def discard_assessment(assessment_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    """Delete a check, its answers, results and photos."""
    _discard(db, _owned(db, user, assessment_id))
    return {"deleted": True}


@router.post("/assessments/{assessment_id}/run")
def run_assessment(assessment_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    a = _owned(db, user, assessment_id)
    if a.status == "done":
        return detail(db, a)
    try:  # a questions-only check still works without AI (not set up, or over its limits): template explanations
        ai = ai_for_user(db, user)
    except HTTPException as e:
        if e.status_code not in (status.HTTP_503_SERVICE_UNAVAILABLE, status.HTTP_429_TOO_MANY_REQUESTS):
            raise
        ai = None
    rules = active_rules(db)
    observations: dict[str, dict] = {}
    for o in db.scalars(select(Observation).where(Observation.assessment_id == a.id)).all():
        if consents.has(db, user.id, "analysis"):
            observations[o.zone] = o.data
        else:  # analysis consent withdrawn since the upload: drop the AI description
            db.delete(o)
    # Safe to repeat: a run that failed half way leaves no duplicate states.
    for old in db.scalars(select(ZoneState).where(ZoneState.assessment_id == a.id)).all():
        db.delete(old)
    for z in a.zones:
        obs_data = observations.get(z.zone)
        result = rules.evaluate_zone(z.zone, obs_data, z.answers)
        explanation = explain_zone(db, ai, result, obs_data, z.answers)
        db.add(ZoneState(user_id=user.id, assessment_id=a.id, zone=z.zone, state=result.state, reasons=result.reasons,
                         rule_ids=result.rule_ids, rules_version=rules.version, explanation=explanation))
    a.status, a.completed_at, a.rules_version = "done", datetime.now(timezone.utc), rules.version
    db.commit()
    out = detail(db, a)
    out["demo_ai"] = bool(getattr(ai, "is_fake", False))
    return out


def detail(db: Session, a: Assessment) -> dict:
    names = zone_names()
    states = {s.zone: s for s in db.scalars(select(ZoneState).where(ZoneState.assessment_id == a.id)).all()}
    obs = {o.zone: o for o in db.scalars(select(Observation).where(Observation.assessment_id == a.id)).all()}
    photos = {p.zone: p for p in db.scalars(select(Photo).where(Photo.assessment_id == a.id)).all()}
    zones = []
    for z in a.zones:
        s, o, p = states.get(z.zone), obs.get(z.zone), photos.get(z.zone)
        zones.append({
            "zone": z.zone, "name": names.get(z.zone, z.zone),
            "you_said": z.answers,
            "ai_observed": {"data": o.data, "model": o.model, "prompt_version": o.prompt_version} if o else None,
            "rules_state": {"state": s.state, "reasons": s.reasons, "rule_ids": s.rule_ids, "rules_version": s.rules_version} if s else None,
            "explanation": s.explanation if s else None,
            "photo": {"id": str(p.id), "kept": bool(p.storage_key), "quality": p.quality} if p else None,
        })
    return {"id": str(a.id), "kind": a.kind, "status": a.status, "created_at": a.created_at.isoformat(),
            "completed_at": a.completed_at.isoformat() if a.completed_at else None, "rules_version": a.rules_version, "zones": zones}


@router.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    return detail(db, _owned(db, user, assessment_id))


@router.get("/assessments")
def list_assessments(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    rows = db.scalars(select(Assessment).where(Assessment.user_id == user.id).order_by(Assessment.created_at.desc()).limit(50)).all()
    return [{"id": str(a.id), "kind": a.kind, "status": a.status, "created_at": a.created_at.isoformat(),
             "zones": [z.zone for z in a.zones]} for a in rows]


@router.get("/map")
def crown_map(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    names = zone_names()
    latest = escalation.latest_zone_states(db, user.id)
    zones = []
    for z in ZONE_IDS:
        s = latest.get(z)
        zones.append({
            "zone": z, "name": names[z], "state": s.state if s else "not_checked",
            "reasons": s.reasons if s else [], "checked_at": s.created_at.isoformat() if s else None,
            "assessment_id": str(s.assessment_id) if s else None, "explanation": s.explanation if s else None,
        })
    return {"zones": zones, "rules_status": active_rules(db).status}


@router.get("/photos/{photo_id}")
def get_photo(photo_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> Response:
    ph = db.get(Photo, parse_uuid(photo_id, "Photo"))
    if ph is None or ph.user_id != user.id or not ph.storage_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    try:
        data = storage.load(ph.storage_key)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found") from None
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    ph = db.get(Photo, parse_uuid(photo_id, "Photo"))
    if ph is None or ph.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    storage.delete(ph.storage_key)
    ph.storage_key, ph.file_deleted_at = None, datetime.now(timezone.utc)
    db.commit()
    return {"deleted": True}
