"""Reviewed library: parsing content/library/*.md, embedding, and search.

Search uses pgvector's cosine distance on Postgres. On SQLite (local development) the same cosine
similarity is worked out in Python over the stored vectors: the library is a few dozen passages.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import LibraryArticle, LibraryChunk

FRONT = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)


@dataclass
class ParsedArticle:
    meta: dict
    body: str
    sections: list[tuple[str, str]]  # (heading, text)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256((yaml.safe_dump(self.meta.get("sources")) + self.body).encode()).hexdigest()


def parse_article(path: Path) -> ParsedArticle:
    raw = path.read_text(encoding="utf-8")
    m = FRONT.match(raw)
    if not m:
        raise ValueError(f"{path.name}: missing front matter")
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2).strip()
    for key in ("id", "title", "sources"):
        if not meta.get(key):
            raise ValueError(f"{path.name}: front matter needs {key}")
    sections: list[tuple[str, str]] = []
    heading, buf = "", []
    for line in body.splitlines():
        if line.startswith("## "):
            if "".join(buf).strip():
                sections.append((heading, "\n".join(buf).strip()))
            heading, buf = line[3:].strip(), []
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append((heading, "\n".join(buf).strip()))
    return ParsedArticle(meta, body, sections)


def upsert_article(db: Session, ai: Any, art: ParsedArticle) -> str:
    """Insert or update one article and its chunks. Returns created | updated | unchanged.

    Articles are re-embedded when their text changes or when the embedding model changes
    (for example after switching from Demo AI to OpenAI).

    The database is the source of truth for review status, so an advisor's review made through
    /admin/library survives a re-ingest. If the text changes, the article goes back to draft.
    """
    meta = art.meta
    row = db.get(LibraryArticle, meta["id"])
    file_status = meta.get("status") or "draft"
    if (
        row is not None
        and row.content_hash == art.content_hash
        and row.chunks
        and all(c.embedding_model == ai.embed_model for c in row.chunks)
    ):
        return "unchanged"
    created = row is None
    if row is None:
        row = LibraryArticle(id=meta["id"])
        db.add(row)
        row.status = file_status
        row.reviewer = meta.get("reviewer")
        row.review_date = meta.get("review_date") if isinstance(meta.get("review_date"), date) else None
    elif row.content_hash != art.content_hash:
        # Changed text needs a fresh review unless the file itself records one.
        row.status = file_status if file_status == "reviewed" else "draft"
        if file_status != "reviewed":
            row.reviewer, row.review_date = None, None
    row.title = meta["title"]
    row.summary = meta.get("summary", "")
    row.body_md = art.body
    row.topics = list(meta.get("topics") or [])
    row.sources = [{"name": s["name"], "url": s["url"]} for s in meta["sources"]]
    row.content_hash = art.content_hash
    row.chunks.clear()
    db.flush()
    texts = [f"{meta['title']}. {h}\n{t}" for h, t in art.sections]
    vectors = ai.embed(texts, feature="library_ingest")
    for i, ((heading, text), vec) in enumerate(zip(art.sections, vectors)):
        row.chunks.append(LibraryChunk(idx=i, heading=heading, text=text, embedding=vec, embedding_model=ai.embed_model))
    db.commit()
    return "created" if created else "updated"


def library_files() -> list[Path]:
    return sorted((get_settings().CONTENT_DIR / "library").glob("*.md"))


def refresh_library(db: Session, ai: Any) -> dict[str, int]:
    """Upserts every library file. Only new, changed or wrongly-embedded articles call the AI."""
    counts = {"created": 0, "updated": 0, "unchanged": 0}
    for f in library_files():
        counts[upsert_article(db, ai, parse_article(f))] += 1
    return counts


def is_embedded_for(db: Session, embed_model: str) -> bool:
    """True when the database holds library passages embedded with this model (so search can find them)."""
    return db.scalar(select(LibraryChunk.id).where(LibraryChunk.embedding_model == embed_model).limit(1)) is not None


def citable_statuses() -> list[str]:
    return ["reviewed", "draft"] if get_settings().LIBRARY_INCLUDE_DRAFTS else ["reviewed"]


@dataclass
class Hit:
    chunk_id: int
    article_id: str
    title: str
    heading: str
    text: str
    similarity: float
    status: str


def _cosine_distance(a: list[float], b: list[float]) -> float:
    """1 - cosine similarity, the same measure as pgvector's <=> operator."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 1.0 - dot / (na * nb) if na and nb else 1.0


def search(db: Session, ai: Any, query: str, k: int = 4, article_ids: list[str] | None = None) -> list[Hit]:
    vec = ai.embed([query], feature="library_search")[0]
    if db.get_bind().dialect.name != "postgresql":
        return _search_in_python(db, ai, [float(x) for x in vec], k, article_ids)
    dist = LibraryChunk.embedding.cosine_distance(vec)
    stmt = (
        select(LibraryChunk, LibraryArticle, dist.label("distance"))
        .join(LibraryArticle, LibraryArticle.id == LibraryChunk.article_id)
        .where(LibraryArticle.status.in_(citable_statuses()))
        .where(LibraryChunk.embedding_model == ai.embed_model)
        .order_by(dist)
        .limit(k)
    )
    if article_ids:
        stmt = stmt.where(LibraryArticle.id.in_(article_ids))
    out = []
    for chunk, art, distance in db.execute(stmt):
        out.append(Hit(chunk.id, art.id, art.title, chunk.heading, chunk.text, 1.0 - float(distance), art.status))
    return out


def _search_in_python(db: Session, ai: Any, vec: list[float], k: int, article_ids: list[str] | None) -> list[Hit]:
    stmt = (
        select(LibraryChunk, LibraryArticle)
        .join(LibraryArticle, LibraryArticle.id == LibraryChunk.article_id)
        .where(LibraryArticle.status.in_(citable_statuses()))
        .where(LibraryChunk.embedding_model == ai.embed_model)
    )
    if article_ids:
        stmt = stmt.where(LibraryArticle.id.in_(article_ids))
    scored = sorted(((_cosine_distance(vec, chunk.embedding), chunk.id, chunk, art) for chunk, art in db.execute(stmt)),
                    key=lambda t: (t[0], t[1]))
    return [Hit(chunk.id, art.id, art.title, chunk.heading, chunk.text, 1.0 - d, art.status) for d, _, chunk, art in scored[:k]]


def chunks_for_articles(db: Session, article_ids: list[str]) -> list[Hit]:
    """All citable chunks of the named articles (used when rules pick the topics)."""
    stmt = (
        select(LibraryChunk, LibraryArticle)
        .join(LibraryArticle, LibraryArticle.id == LibraryChunk.article_id)
        .where(LibraryArticle.id.in_(article_ids), LibraryArticle.status.in_(citable_statuses()))
        .order_by(LibraryArticle.id, LibraryChunk.idx)
    )
    return [Hit(c.id, a.id, a.title, c.heading, c.text, 1.0, a.status) for c, a in db.execute(stmt)]


def source_cards(db: Session, article_ids: list[str]) -> list[dict]:
    rows = db.scalars(select(LibraryArticle).where(LibraryArticle.id.in_(article_ids))).all()
    by_id = {r.id: r for r in rows}
    cards = []
    for aid in dict.fromkeys(article_ids):
        r = by_id.get(aid)
        if r:
            cards.append({
                "article_id": r.id, "title": r.title, "sources": r.sources, "status": r.status,
                "reviewer": r.reviewer, "review_date": r.review_date.isoformat() if r.review_date else None,
            })
    return cards


def passages_block(hits: list[Hit]) -> str:
    return "\n\n".join(f"[{h.chunk_id}] {h.title}: {h.heading}\n{h.text}" for h in hits)
