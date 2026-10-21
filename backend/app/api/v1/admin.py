"""Advisor-only routes (Phase 2): library content, review status, rules, and the Coach backlog."""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import make_ai
from app.core.db import get_db
from app.core.security import advisor_user
from app.library import ParsedArticle, upsert_article
from app.models import AuditLog, CoachMessage, LibraryArticle, RulesVersion, User
from app.rules.engine import Rules, RulesError

router = APIRouter(prefix="/admin")


class Source(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    url: str = Field(pattern=r"^https://", max_length=500)


class ArticleIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]{3,80}$")
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(default="", max_length=300)
    topics: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(min_length=1)
    body_md: str = Field(min_length=20, description="Markdown with ## section headings")


@router.post("/library")
def add_or_update_article(body: ArticleIn, db: Session = Depends(get_db), user: User = Depends(advisor_user)) -> dict:
    sections, heading, buf = [], "", []
    for line in body.body_md.splitlines():
        if line.startswith("## "):
            if "".join(buf).strip():
                sections.append((heading, "\n".join(buf).strip()))
            heading, buf = line[3:].strip(), []
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append((heading, "\n".join(buf).strip()))
    meta = {"id": body.id, "title": body.title, "summary": body.summary, "topics": body.topics,
            "sources": [s.model_dump() for s in body.sources], "status": "draft"}
    result = upsert_article(db, make_ai(db, user.id), ParsedArticle(meta, body.body_md.strip(), sections))
    db.add(AuditLog(user_id=user.id, action="library_upsert", detail={"article": body.id, "result": result}))
    db.commit()
    return {"id": body.id, "result": result, "status": db.get(LibraryArticle, body.id).status}


class ReviewIn(BaseModel):
    status: Literal["draft", "reviewed", "retired"]
    reviewer: str | None = Field(default=None, max_length=120)
    review_date: date | None = None


@router.patch("/library/{article_id}")
def review_article(article_id: str, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(advisor_user)) -> dict:
    a = db.get(LibraryArticle, article_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    if body.status == "reviewed" and not (body.reviewer and body.review_date):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A reviewed article needs a reviewer and a review date.")
    a.status = body.status
    a.reviewer = body.reviewer if body.status == "reviewed" else a.reviewer
    a.review_date = body.review_date if body.status == "reviewed" else a.review_date
    db.add(AuditLog(user_id=user.id, action="library_review", detail={"article": article_id, "status": body.status}))
    db.commit()
    return {"id": a.id, "status": a.status, "reviewer": a.reviewer, "review_date": a.review_date.isoformat() if a.review_date else None}


@router.put("/rules")
async def put_rules(request: Request, db: Session = Depends(get_db), user: User = Depends(advisor_user)) -> dict:
    """Upload a new rules YAML (Content-Type: text/yaml or text/plain). Validated before it goes live."""
    text = (await request.body()).decode("utf-8")
    try:
        rules = Rules.from_yaml(text)
    except (RulesError, KeyError, TypeError) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Rules rejected: {e}") from e
    if db.scalars(select(RulesVersion).where(RulesVersion.version == rules.version)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "That version already exists. Change `version:` in the file.")
    db.add(RulesVersion(version=rules.version, yaml_text=text, uploaded_by=user.id))
    db.add(AuditLog(user_id=user.id, action="rules_upload", detail={"version": rules.version, "status": rules.status}))
    db.commit()
    return {"version": rules.version, "status": rules.status}


@router.get("/backlog")
def coach_backlog(db: Session = Depends(get_db), user: User = Depends(advisor_user)) -> list[dict[str, Any]]:
    """Questions the Coach had no reviewed answer for, newest first (question text only)."""
    rows = db.scalars(
        select(CoachMessage).where(CoachMessage.kind == "no_reviewed_answer").order_by(CoachMessage.created_at.desc()).limit(200)
    ).all()
    return [{"question": m.question, "created_at": m.created_at.isoformat()} for m in rows]
