"""Hair Rhythm: install, wear, take down, rest; and the day cards on Today (B03)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CheckIn, Profile, Reminder, StylePeriod, User
from app.services import consents, escalation

PROTECTIVE = {"braids", "twists", "locs", "cornrows", "wig", "weave", "other"}
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
STAGES = ["install", "wear", "take_down", "rest", "ended"]


def active_period(db: Session, user_id: uuid.UUID) -> StylePeriod | None:
    return db.scalars(
        select(StylePeriod)
        .where(StylePeriod.user_id == user_id, StylePeriod.stage != "ended")
        .order_by(StylePeriod.install_date.desc(), StylePeriod.created_at.desc())
        .limit(1)
    ).first()


def day_in_style(period: StylePeriod, today: date) -> int:
    return (today - period.install_date).days + 1


def period_dict(p: StylePeriod, today: date) -> dict:
    return {
        "id": str(p.id), "style_name": p.style_name, "style_kind": p.style_kind, "stage": p.stage,
        "install_date": p.install_date.isoformat(),
        "take_down_planned": p.take_down_planned.isoformat() if p.take_down_planned else None,
        "take_down_date": p.take_down_date.isoformat() if p.take_down_date else None,
        "rest_until": p.rest_until.isoformat() if p.rest_until else None,
        "ended_at": p.ended_at.isoformat() if p.ended_at else None,
        "day": day_in_style(p, today),
    }


def next_wash_day(wash_day: str | None, today: date) -> tuple[date, bool] | None:
    if wash_day not in WEEKDAYS:
        return None
    target = WEEKDAYS.index(wash_day)
    delta = (target - today.weekday()) % 7
    return today + timedelta(days=delta), delta == 0


def today_cards(db: Session, user: User, today: date) -> dict:
    profile = db.get(Profile, user.id)
    pdata = profile.data if profile else {}
    period = active_period(db, user.id)
    cards: list[dict] = []

    if profile is None or profile.onboarding_completed_at is None:
        cards.append({"type": "onboarding", "title": "Finish setting up", "body": "A few quick questions so your Today screen fits your routine.", "href": "/start"})

    # Escalation first: it is the only card that can matter more than the routine.
    hits = escalation.active_hits(db, user)
    if hits:
        cards.append({"type": "get_checked", "title": "Worth getting checked",
                      "body": hits[0]["reason"], "href": "/get-checked"})

    last = db.scalars(
        select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()).limit(1)
    ).first()
    health_ok = consents.has(db, user.id, "health_data")
    if period and period.stage in ("install", "wear"):
        day = day_in_style(period, today)
        day3_done = db.scalars(
            select(CheckIn.id).where(CheckIn.style_period_id == period.id, CheckIn.template == "day-3")
        ).first()
        if day >= 3 and not day3_done:
            cards.append({"type": "checkin", "template": "day-3", "title": f"Day-{min(day, 3)} check-in",
                          "question": "Any tightness or soreness?", "field": "tightness",
                          "options": [["none", "None"], ["a_little", "A little"], ["hurts", "It hurts"]],
                          "needs_consent": not health_ok, "href": "/check-in/day-3"})
        elif last is None or (datetime.now(timezone.utc) - last.created_at) >= timedelta(days=7):
            cards.append(_weekly_card(health_ok))
    elif last is None or (datetime.now(timezone.utc) - last.created_at) >= timedelta(days=7):
        cards.append(_weekly_card(health_ok))

    nwd = next_wash_day(pdata.get("wash_day"), today)
    if nwd:
        d, is_today = nwd
        name = WEEKDAY_NAMES[d.weekday()]
        cards.append({"type": "wash_day", "primary": True,
                      "title": "Wash day is today" if is_today else f"Wash day is {name}",
                      "body": "Start wash-day mode" if is_today else "Get your steps ready", "href": "/wash-day"})

    if period and period.take_down_planned:
        days_left = (period.take_down_planned - today).days
        if 0 <= days_left <= 3 and period.stage in ("install", "wear"):
            when = "today" if days_left == 0 else f"in {days_left} day{'s' if days_left != 1 else ''}"
            cards.append({"type": "take_down", "title": f"Take-down {when}",
                          "body": "With your hairline visible, it's a good day for a quick photo check of your edges. Photos stay optional.",
                          "href": "/take-down"})
    if period and period.stage == "take_down":
        cards.append({"type": "take_down", "title": "Take-down day",
                      "body": "A good day for a quick check of your edges while they're visible. Photos stay optional.", "href": "/take-down"})
    if period and period.stage == "rest":
        cards.append({"type": "rest", "title": "Rest days",
                      "body": "Your hair is between styles. A good time for a wash day and a weekly check-in.", "href": "/journal"})

    goals = pdata.get("goals") or []
    learn = "tight-styles-and-your-edges" if ("edges" in goals or (period and period.style_kind in PROTECTIVE)) else "wash-day-basics"
    cards.append({"type": "learn", "title": "Learn", "article": learn, "href": f"/ask?article={learn}"})

    return {
        "date": today.isoformat(),
        "name": user.display_name,
        "period": period_dict(period, today) if period else None,
        "cards": cards,
    }


def _weekly_card(health_ok: bool) -> dict:
    return {"type": "checkin", "template": "weekly", "title": "Weekly check-in", "question": "Does your style feel tight?",
            "field": "tightness", "options": [["none", "No"], ["a_little", "A little"], ["hurts", "It hurts"]],
            "needs_consent": not health_ok, "href": "/check-in/weekly"}


def pending_reminders(db: Session, user_id: uuid.UUID) -> list[Reminder]:
    return list(db.scalars(select(Reminder).where(Reminder.user_id == user_id, Reminder.status == "pending")).all())
