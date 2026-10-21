"""Patterns that lead to Get checked, and the 'not now' reminder (FR13)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import zone_names
from app.models import CheckIn, Reminder, User, ZoneState
from app.rules.engine import active_rules

FIELDS = ["tightness", "soreness", "bumps", "itch", "edges"]


def checkin_history(db: Session, user_id: uuid.UUID, days: int = 120) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.scalars(select(CheckIn).where(CheckIn.user_id == user_id, CheckIn.created_at >= since)).all()
    return [{"created_at": r.created_at, **{f: getattr(r, f) for f in FIELDS}} for r in rows]


def latest_zone_states(db: Session, user_id: uuid.UUID) -> dict[str, ZoneState]:
    rows = db.scalars(select(ZoneState).where(ZoneState.user_id == user_id).order_by(ZoneState.created_at)).all()
    latest: dict[str, ZoneState] = {}
    for r in rows:
        if r.state != "not_checked" or r.zone not in latest:
            latest[r.zone] = r  # a later Not checked doesn't hide an earlier result
    return latest


def all_hits(db: Session, user: User) -> list[dict]:
    """Reasons to suggest getting checked. They come from hair-health records, so none are used
    once the person withdraws that consent."""
    from app.services import consents

    if not consents.has(db, user.id, "health_data"):
        return []
    rules = active_rules(db)
    hits = [
        {"source": "pattern", "rule_id": h.rule_id, "result": h.result, "reason": h.reason}
        for h in rules.evaluate_patterns(checkin_history(db, user.id))
        if h.result == "get_checked"
    ]
    names = zone_names()
    for zone, zs in latest_zone_states(db, user.id).items():
        if zs.state == "get_checked":
            hits.append({"source": "zone", "rule_id": (zs.rule_ids or [""])[0], "result": "get_checked",
                         "reason": f"{names.get(zone, zone)}: {zs.reasons[0] if zs.reasons else 'marked Get checked'}"})
    return hits


def snoozed_until(db: Session, user_id: uuid.UUID) -> datetime | None:
    row = db.scalars(
        select(Reminder)
        .where(Reminder.user_id == user_id, Reminder.kind == "get_checked", Reminder.status == "pending")
        .order_by(Reminder.due_at.desc())
        .limit(1)
    ).first()
    if row and row.due_at > datetime.now(timezone.utc):
        return row.due_at
    return None


def active_hits(db: Session, user: User) -> list[dict]:
    if snoozed_until(db, user.id):
        return []
    return all_hits(db, user)


def not_now(db: Session, user: User, days: int) -> datetime:
    for r in db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.kind == "get_checked", Reminder.status == "pending")):
        r.status = "dismissed"
    due = datetime.now(timezone.utc) + timedelta(days=days)
    db.add(Reminder(user_id=user.id, kind="get_checked", due_at=due, payload={"days": days}))
    db.commit()
    return due
