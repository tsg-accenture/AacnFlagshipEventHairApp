"""Profile, onboarding, Hair Rhythm, check-ins, care plans, journey and goals (Phases 1–2)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.moderate import check_text
from app.ai.text_jobs import parse_onboarding, plan_intro
from app.api.deps import ai_for_user, make_ai, moderate_or_raise, parse_uuid
from app.content import ZONE_IDS, load_yaml
from app.core.db import get_db
from app.core.ratelimit import check_ai_limits
from app.core.security import current_user
from app.models import Assessment, CarePlan, CheckIn, Goal, Photo, Profile, StylePeriod, User, ZoneState
from app.services import checkins as checkin_svc
from app.services import consents
from app.services.plans import build_plan, wash_day_steps
from app.services.rhythm import STAGES, active_period, period_dict, today_cards

router = APIRouter()

StyleKind = Literal["braids", "twists", "locs", "cornrows", "wig", "weave", "natural", "other"]
HEALTH_KEYS = {"concerns", "zones", "concern_text"}


# ----- Profile and onboarding -----

Concern = Literal["tension", "edges", "breakage", "dryness", "itch_flaking", "bumps", "shedding", "scalp_pain", "other"]
ZoneName = Literal["hairline", "left_temple", "right_temple", "crown", "nape"]


class ProfileData(BaseModel):
    """Every field the profile can hold, with its allowed values. Unknown fields are rejected."""

    model_config = {"extra": "forbid"}
    route: Literal["routine", "concern", "questions"] | None = None
    style_kind: StyleKind | None = None
    wash_frequency: Literal["weekly", "fortnightly", "less", "varies"] | None = None
    wash_day: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun", "varies"] | None = None
    treatments: list[Literal["heat", "relaxer", "colour"]] | None = Field(default=None, max_length=3)
    goals: list[Literal["moisture", "breakage", "edges", "length", "scalp", "learning"]] | None = Field(default=None, max_length=6)
    concerns: list[Concern] | None = Field(default=None, max_length=9)
    zones: list[ZoneName] | None = Field(default=None, max_length=5)
    concern_text: str | None = Field(default=None, max_length=2000)


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    data: ProfileData = Field(default_factory=ProfileData)
    complete_onboarding: bool = False


@router.get("/profile")
def get_profile(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    p = db.get(Profile, user.id)
    return {"display_name": user.display_name, "route": p.route if p else None, "data": p.data if p else {},
            "onboarding_completed_at": p.onboarding_completed_at.isoformat() if p and p.onboarding_completed_at else None}


@router.put("/profile")
def put_profile(body: ProfileIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    given = body.data.model_dump(exclude_unset=True)
    if any(given.get(k) for k in HEALTH_KEYS):
        consents.require(db, user.id, "health_data")
    p = db.get(Profile, user.id)
    if p is None:
        p = Profile(user_id=user.id, data={})
        db.add(p)
    merged = dict(p.data or {})
    merged.update(given)
    p.data = merged
    p.route = merged.get("route") or p.route
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.complete_onboarding and p.onboarding_completed_at is None:
        p.onboarding_completed_at = datetime.now(timezone.utc)
    db.commit()
    return get_profile(db, user)


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/onboarding/parse")
def onboarding_parse(body: ParseIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    consents.require(db, user.id, "health_data")
    check_ai_limits(db, user)
    ai = make_ai(db, user.id)
    chk = check_text(ai, body.text, "onboarding")
    if chk.support:
        return {"support": chk.support}
    if not chk.allowed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, chk.message)
    fields = parse_onboarding(ai, body.text)
    return {"fields": fields.model_dump(), "demo_ai": bool(getattr(ai, "is_fake", False))}


@router.get("/content/{name}")
def content(name: Literal["onboarding", "consents", "zones", "checkins", "referrals", "support"]) -> dict:
    """Non-personal, advisor-owned content the app renders (questions, wording, links)."""
    return load_yaml(name)


# ----- Hair Rhythm -----

class PeriodIn(BaseModel):
    style_name: str = Field(min_length=1, max_length=80)
    style_kind: StyleKind
    install_date: date
    take_down_planned: date | None = None


class PeriodPatch(BaseModel):
    stage: Literal["install", "wear", "take_down", "rest", "ended"] | None = None
    take_down_planned: date | None = None
    take_down_date: date | None = None
    rest_until: date | None = None
    style_name: str | None = Field(default=None, max_length=80)


@router.post("/rhythm/periods", status_code=201)
def create_period(body: PeriodIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    today = date.today()
    if body.install_date > today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The install date can't be in the future.")
    if body.take_down_planned and body.take_down_planned < body.install_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Take-down can't be before install.")
    # A new install ends whatever was active.
    current = active_period(db, user.id)
    if current:
        current.stage = "ended"
        current.ended_at = body.install_date
    stage = "install" if body.install_date == today else "wear"
    p = StylePeriod(user_id=user.id, style_name=body.style_name.strip(), style_kind=body.style_kind, stage=stage,
                    install_date=body.install_date, take_down_planned=body.take_down_planned)
    db.add(p)
    db.commit()
    return period_dict(p, today)


@router.patch("/rhythm/periods/{period_id}")
def patch_period(period_id: str, body: PeriodPatch, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    p = db.get(StylePeriod, parse_uuid(period_id, "Style"))
    if p is None or p.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Style not found")
    today = date.today()
    if body.stage:
        if STAGES.index(body.stage) < STAGES.index(p.stage):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A style can only move forward: install, wear, take down, rest.")
        p.stage = body.stage
        if body.stage == "take_down" and not p.take_down_date:
            p.take_down_date = body.take_down_date or today
        if body.stage == "ended":
            p.ended_at = today
    for f in ("take_down_planned", "take_down_date", "rest_until"):
        v = getattr(body, f)
        if v is not None:
            if v < p.install_date:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Dates can't be before the install date.")
            setattr(p, f, v)
    if body.style_name:
        p.style_name = body.style_name.strip()
    db.commit()
    return period_dict(p, today)


@router.get("/rhythm/periods")
def list_periods(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    today = date.today()
    rows = db.scalars(select(StylePeriod).where(StylePeriod.user_id == user.id).order_by(StylePeriod.install_date.desc())).all()
    return [period_dict(p, today) for p in rows]


@router.get("/rhythm/today")
def rhythm_today(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    return today_cards(db, user, date.today())


# ----- Check-ins -----

class CheckinIn(BaseModel):
    template: str = Field(max_length=30)
    answers: dict[str, str]
    note: str | None = Field(default=None, max_length=2000)


@router.get("/checkins/templates")
def checkin_templates() -> dict:
    return checkin_svc.templates()


@router.post("/checkins", status_code=201)
def post_checkin(body: CheckinIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    consents.require(db, user.id, "health_data")
    ai = None
    if body.note and body.note.strip():
        check_ai_limits(db, user)
        ai = make_ai(db, user.id)
    return checkin_svc.submit(db, ai, user, body.template, body.answers, (body.note or "").strip() or None, date.today())


@router.get("/checkins")
def get_checkins(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    rows = db.scalars(select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()).limit(limit)).all()
    return [checkin_svc.to_dict(c) for c in rows]


# ----- Care plans and wash day -----

TEMPLATE_INTRO = "Your plan, built from our draft care templates and your routine."


@router.get("/plans/current")
def plan_current(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    """Items are rebuilt from the templates every time, so they follow your latest style and answers.
    Only the optional AI-written intro is stored (POST /plans/refresh)."""
    data = build_plan(db.get(Profile, user.id), active_period(db, user.id))
    row = db.scalars(select(CarePlan).where(CarePlan.user_id == user.id).order_by(CarePlan.created_at.desc()).limit(1)).first()
    intro, source, at = (row.intro, row.intro_source, row.created_at) if row else (TEMPLATE_INTRO, "template", None)
    return {"intro": intro, "intro_source": source, "intro_written_at": at.isoformat() if at else None, **data}


@router.post("/plans/refresh")
def plan_refresh(db: Session = Depends(get_db), user: User = Depends(current_user), ai: Any = Depends(ai_for_user)) -> dict:
    data = build_plan(db.get(Profile, user.id), active_period(db, user.id))
    items = [i["text"] for s in data["sections"] for i in s["items"]]
    intro = plan_intro(ai, items, data["goals"])
    row = CarePlan(user_id=user.id, data=data, intro=intro or TEMPLATE_INTRO, intro_source="ai" if intro else "template")
    db.add(row)
    db.commit()
    return {"intro": row.intro, "intro_source": row.intro_source, "intro_written_at": row.created_at.isoformat(),
            "demo_ai": bool(getattr(ai, "is_fake", False)), **data}


@router.get("/plans/wash-day")
def plan_wash_day(user: User = Depends(current_user)) -> dict:
    return {"steps": wash_day_steps(), "timer_presets_minutes": [3, 5, 10, 15, 20, 30]}


# ----- Journey and goals -----

@router.get("/journey")
def journey(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    today = date.today()
    periods = db.scalars(select(StylePeriod).where(StylePeriod.user_id == user.id).order_by(StylePeriod.install_date.desc())).all()
    cis = db.scalars(select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()).limit(200)).all()
    assessments = db.scalars(
        select(Assessment).where(Assessment.user_id == user.id, Assessment.status == "done").order_by(Assessment.created_at.desc())
    ).all()
    states = db.scalars(select(ZoneState).where(ZoneState.user_id == user.id)).all()
    by_a: dict = {}
    for s in states:
        by_a.setdefault(s.assessment_id, []).append({"zone": s.zone, "state": s.state})
    photos = db.scalars(select(Photo).where(Photo.user_id == user.id, Photo.storage_key.is_not(None))).all()
    photo_by_a: dict = {}
    for ph in photos:
        photo_by_a.setdefault(ph.assessment_id, []).append({"id": str(ph.id), "zone": ph.zone})
    return {
        "periods": [period_dict(p, today) for p in periods],
        "checkins": [checkin_svc.to_dict(c) for c in cis],
        "assessments": [{"id": str(a.id), "kind": a.kind, "created_at": a.created_at.isoformat(),
                         "zones": by_a.get(a.id, []), "photos": photo_by_a.get(a.id, [])} for a in assessments],
        "label": "This is your own record: your diary, the styles you wore and the checks you ran. It is not an AI judgement.",
    }


@router.get("/journey/compare")
def journey_compare(zone: str, from_: str = Query(alias="from"), to: str = Query(), db: Session = Depends(get_db),
                    user: User = Depends(current_user)) -> dict:
    if zone not in ZONE_IDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown zone")
    out = {}
    for key, aid in (("from", from_), ("to", to)):
        a = db.get(Assessment, parse_uuid(aid, "Check"))
        if a is None or a.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Check not found")
        ph = db.scalars(select(Photo).where(Photo.assessment_id == a.id, Photo.zone == zone, Photo.storage_key.is_not(None))).first()
        zs = db.scalars(select(ZoneState).where(ZoneState.assessment_id == a.id, ZoneState.zone == zone)).first()
        out[key] = {"assessment_id": str(a.id), "date": a.created_at.isoformat(), "photo_id": str(ph.id) if ph else None,
                    "state": zs.state if zs else "not_checked", "reasons": zs.reasons if zs else []}
    return {"zone": zone, **out,
            "limits": "Photos taken in different light, angles or styles can look different even when nothing has changed."}


GoalArea = Literal["moisture", "breakage", "edges", "length", "scalp", "other"]
# Preset titles the app offers; anything else typed by the person is screened by moderation.
GOAL_PRESETS = {"Healthy edges", "More moisture", "Less breakage", "Length retention", "A comfortable scalp"}


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    area: GoalArea


class GoalPatch(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    status: Literal["active", "reached", "paused"] | None = None
    milestone: str | None = Field(default=None, max_length=300)


def _goal(g: Goal) -> dict:
    return {"id": str(g.id), "title": g.title, "area": g.area, "status": g.status, "milestones": g.milestones,
            "created_at": g.created_at.isoformat()}


@router.get("/goals")
def list_goals(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    return [_goal(g) for g in db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at)).all()]


@router.post("/goals", status_code=201)
def create_goal(body: GoalIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    if body.title.strip() not in GOAL_PRESETS and (support := moderate_or_raise(db, user, body.title, "goal")):
        return {"saved": False, "support": support}
    g = Goal(user_id=user.id, title=body.title.strip(), area=body.area, milestones=[])
    db.add(g)
    db.commit()
    return _goal(g)


@router.patch("/goals/{goal_id}")
def patch_goal(goal_id: str, body: GoalPatch, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    g = db.get(Goal, parse_uuid(goal_id, "Goal"))
    if g is None or g.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    # Screen any typed text before changing anything.
    for text in (body.title if body.title and body.title.strip() not in GOAL_PRESETS else None, body.milestone):
        if support := moderate_or_raise(db, user, text, "goal"):
            return {"saved": False, "support": support}
    if body.title:
        g.title = body.title.strip()
    if body.status:
        g.status = body.status
    if body.milestone:
        g.milestones = [*g.milestones, {"date": date.today().isoformat(), "note": body.milestone.strip()}]
    db.commit()
    return _goal(g)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    g = db.get(Goal, parse_uuid(goal_id, "Goal"))
    if g is None or g.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    db.delete(g)
    db.commit()
    return {"deleted": True}
