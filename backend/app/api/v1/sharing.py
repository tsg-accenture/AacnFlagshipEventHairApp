"""Get checked, care pack and stylist note (Phase 4). Nothing leaves the app without the person pressing share."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.text_jobs import polish_stylist_note
from app.api.deps import make_ai, moderate_or_raise
from app.content import load_yaml
from app.core.db import get_db
from app.core.ratelimit import check_ai_limits
from app.core.security import current_user
from app.models import AuditLog, CarePack, StylistNote, User
from app.services import consents, escalation
from app.services.sharing import care_pack_pdf, stylist_items

router = APIRouter()


@router.get("/referrals")
def referrals(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    content = load_yaml("referrals")
    snoozed = escalation.snoozed_until(db, user.id)
    return {
        "reasons": escalation.all_hits(db, user),
        "snoozed_until": snoozed.isoformat() if snoozed else None,
        "links": content["links"],
        "questions": content["questions_for_appointment"],
        "note": "Crown AI can't tell you what's causing a change. A GP or specialist can.",
    }


class NotNowIn(BaseModel):
    days: int = Field(default=14, ge=1, le=90)


@router.post("/referrals/not-now")
def not_now(body: NotNowIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    due = escalation.not_now(db, user, body.days)
    return {"remind_at": due.isoformat()}


class CarePackIn(BaseModel):
    include_checkins: bool = True
    include_zones: bool = True
    photo_ids: list[str] = Field(default_factory=list, max_length=10)
    questions: list[str] = Field(default_factory=list, max_length=12)
    note: str | None = Field(default=None, max_length=1500)


@router.post("/care-pack")
def care_pack(body: CarePackIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> Response:
    consents.require(db, user.id, "sharing")
    for text in [body.note, *[q for q in body.questions if q not in load_yaml("referrals")["questions_for_appointment"]]]:
        if support := moderate_or_raise(db, user, text, "care_pack"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"code": "support", "support": support})
    pdf, contents = care_pack_pdf(db, user, body.include_checkins, body.include_zones, body.photo_ids,
                                  [q.strip() for q in body.questions if q.strip()], (body.note or "").strip() or None)
    db.add(CarePack(user_id=user.id, contents=contents))
    db.add(AuditLog(user_id=user.id, action="care_pack_created", detail={"photos": len(contents["photos"])}))
    db.commit()
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="crown-ai-care-pack.pdf"', "Cache-Control": "no-store"})


@router.get("/stylist-note/items")
def note_items(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    return {"items": stylist_items(db, user)}


class StylistNoteIn(BaseModel):
    item_ids: list[str] = Field(min_length=1, max_length=12)
    polish: bool = False


@router.post("/stylist-note")
def stylist_note(body: StylistNoteIn, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    consents.require(db, user.id, "sharing")
    items = {i["id"]: i for i in stylist_items(db, user)}
    unknown = [i for i in body.item_ids if i not in items]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Some items are no longer available. Reload and tick again.")
    chosen = [items[i] for i in dict.fromkeys(body.item_ids)]
    lines = {i["id"]: i["text"] for i in chosen}
    polished = False
    demo = False
    if body.polish:
        check_ai_limits(db, user)
        ai: Any = make_ai(db, user.id)
        demo = bool(getattr(ai, "is_fake", False))
        better = polish_stylist_note(ai, [{"id": i["id"], "text": i["text"]} for i in chosen])
        if better:
            lines.update(better)
            polished = True
    greeting = "Hi! Before we start, a few things about my hair:"
    text = greeting + "\n" + "\n".join(f"- {lines[i['id']]}" for i in chosen) + "\nThank you!"
    note = StylistNote(user_id=user.id, item_ids=[i["id"] for i in chosen], text=text, polished=polished)
    db.add(note)
    db.commit()
    return {"id": str(note.id), "text": text, "polished": polished, "demo_ai": demo}
