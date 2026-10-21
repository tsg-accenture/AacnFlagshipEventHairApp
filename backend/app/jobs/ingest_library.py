"""Embed content/library/*.md into the database (SQLite locally, Postgres with pgvector in production).

Run from backend/:  uv run python -m app.jobs.ingest_library
Re-run after editing articles. Unchanged articles are skipped. Changed text goes back to draft
unless the file itself records a review (status: reviewed, reviewer, review_date).
"""
import sys

from app.ai.openai_client import AIServiceError, AIUnavailable, get_ai
from app.core.config import get_settings
from app.core.db import session_factory
from app.library import parse_article, upsert_article


def main() -> int:
    s = get_settings()
    folder = s.CONTENT_DIR / "library"
    files = sorted(folder.glob("*.md"))
    if not files:
        print(f"No articles found in {folder}")
        return 1
    db = session_factory()()
    try:
        try:
            ai = get_ai(db, None)
        except AIUnavailable as e:
            print(f"Can't embed: {e}")
            return 1
        print(f"Embedding with {ai.embed_model} ({'Demo AI, for trying the app' if s.uses_demo_ai else 'OpenAI'})")
        for f in files:
            art = parse_article(f)
            try:
                result = upsert_article(db, ai, art)
            except AIServiceError as e:
                print(f"OpenAI didn't answer ({e}). Check OPENAI_API_KEY and OPENAI_BASE_URL in backend/.env.")
                return 1
            print(f"  {result:9} {art.meta['id']}  ({len(art.sections)} passages, status from file: {art.meta.get('status', 'draft')})")
    finally:
        db.close()
    if not s.LIBRARY_INCLUDE_DRAFTS:
        print("Note: LIBRARY_INCLUDE_DRAFTS=false, so the Coach only cites articles an advisor has marked reviewed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
