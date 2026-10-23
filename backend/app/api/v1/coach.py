"""Reviewed library and Hair Coach (Phase 2)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import coach as coach_ai
from app.api.deps import ai_for_user
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_user
from app.library import citable_statuses
from app.models import CoachMessage, LibraryArticle, User
from app.services.demo_products import serialize_coach_answer

router = APIRouter()


def article_dict(a: LibraryArticle, full: bool = True) -> dict:
    d = {"id": a.id, "title": a.title, "summary": a.summary, "topics": a.topics, "sources": a.sources,
         "status": a.status, "reviewer": a.reviewer, "review_date": a.review_date.isoformat() if a.review_date else None}
    if full:
        d["body_md"] = a.body_md
    return d


@router.get("/library/articles")
def list_articles(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    rows = db.scalars(select(LibraryArticle).where(LibraryArticle.status.in_(citable_statuses())).order_by(LibraryArticle.title)).all()
    return [article_dict(a, full=False) for a in rows]


@router.get("/library/articles/{article_id}")
def get_article(article_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    a = db.get(LibraryArticle, article_id)
    if a is None or a.status not in citable_statuses():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    return article_dict(a)


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=1000)


@router.post("/coach/ask")
def ask(body: AskIn, db: Session = Depends(get_db), user: User = Depends(current_user), ai: Any = Depends(ai_for_user)) -> dict:
    result = coach_ai.ask(db, ai, body.question.strip())
    msg = CoachMessage(
        user_id=user.id, question=body.question.strip(), kind=result["kind"], answer=result,
        cited_chunk_ids=result.get("cited", []), model=result.get("model"), prompt_version=result.get("prompt_version"),
    )
    db.add(msg)
    db.commit()
    visible_result = serialize_coach_answer(
        result,
        kind=msg.kind,
        enabled=get_settings().demo_products_enabled,
    )
    return {"id": str(msg.id), "created_at": msg.created_at.isoformat(), "question": msg.question,
            "demo_ai": bool(getattr(ai, "is_fake", False)), **visible_result}


@router.get("/coach/history")
def history(limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[dict]:
    rows = db.scalars(select(CoachMessage).where(CoachMessage.user_id == user.id).order_by(CoachMessage.created_at.desc()).limit(limit)).all()
    # demo_ai is derived from the stored model name, so past Demo AI answers keep their label.
    enabled = get_settings().demo_products_enabled
    return [
        {
            "id": str(m.id),
            "created_at": m.created_at.isoformat(),
            "question": m.question,
            "demo_ai": m.model == "fake",
            **serialize_coach_answer(m.answer, kind=m.kind, enabled=enabled),
        }
        for m in rows
    ]
