"""Check-ins (FR06, FR13): answers → rules outcome → advice, plus pattern escalation."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import library
from app.ai.moderate import check_text
from app.content import load_yaml
from app.models import CheckIn, User
from app.rules.engine import active_rules
from app.services import escalation
from app.services.rhythm import active_period, day_in_style


def templates() -> dict:
    return load_yaml("checkins")["templates"]


def validate_answers(template: str, answers: dict) -> dict:
    tpls = templates()
    if template not in tpls:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown check-in")
    clean = {}
    for q in tpls[template]["questions"]:
        v = answers.get(q["field"])
        allowed = [o[0] for o in q["options"]]
        if v is None:
            continue
        if v not in allowed:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"'{v}' isn't an answer to: {q['text']}")
        clean[q["field"]] = v
    if not clean:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Answer at least one question.")
    return clean


def submit(db: Session, ai: Any, user: User, template: str, answers: dict, note: str | None, today: date) -> dict:
    clean = validate_answers(template, answers)
    if note:
        if ai is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Notes need the moderation service. Leave the note blank, or set up AI.")
        chk = check_text(ai, note, "checkin_note")
        if chk.support:
            return {"saved": False, "support": chk.support}
        if not chk.allowed:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, chk.message)
    rules = active_rules(db)
    res = rules.evaluate_checkin(clean)
    period = active_period(db, user.id)
    row = CheckIn(
        user_id=user.id, style_period_id=period.id if period else None, template=template, note=note or None,
        day_in_style=day_in_style(period, today) if period else None, outcome=res.outcome, rule_ids=res.rule_ids,
        rules_version=res.rules_version, **clean,
    )
    db.add(row)
    db.commit()
    hits = escalation.all_hits(db, user)
    article = res.message.get("article")
    return {
        "saved": True,
        "id": str(row.id),
        "outcome": res.outcome,
        "title": res.message["title"],
        "body": res.message["body"].strip(),
        "action": res.message["action"],
        "article": library.source_cards(db, [article])[0] if article and library.source_cards(db, [article]) else None,
        "rules_version": res.rules_version,
        "rules_status": rules.status,
        "escalate": res.escalate or bool(hits),
        "escalation_reasons": [h["reason"] for h in hits],
    }


def to_dict(c: CheckIn) -> dict:
    return {
        "id": str(c.id), "template": c.template, "created_at": c.created_at.isoformat(), "day_in_style": c.day_in_style,
        "tightness": c.tightness, "soreness": c.soreness, "bumps": c.bumps, "itch": c.itch, "edges": c.edges,
        "note": c.note, "outcome": c.outcome, "style_period_id": str(c.style_period_id) if c.style_period_id else None,
    }
