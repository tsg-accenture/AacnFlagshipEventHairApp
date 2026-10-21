"""Advisor tasks from the command line (same effect as the /api/v1/admin routes).

Run from backend/:
  uv run python -m app.jobs.advisor review <article-id> --reviewer "Dr A. Example" --date 2026-11-01
  uv run python -m app.jobs.advisor draft <article-id>
  uv run python -m app.jobs.advisor rules path/to/rules.yaml
  uv run python -m app.jobs.advisor status
"""
import argparse
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.core.db import session_factory
from app.models import AuditLog, LibraryArticle, RulesVersion
from app.rules.engine import Rules, RulesError, active_rules


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="python -m app.jobs.advisor")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("review", help="Mark a library article as reviewed")
    r.add_argument("article_id")
    r.add_argument("--reviewer", required=True)
    r.add_argument("--date", required=True, type=date.fromisoformat)
    d = sub.add_parser("draft", help="Put an article back to draft")
    d.add_argument("article_id")
    u = sub.add_parser("rules", help="Validate and activate a rules YAML file")
    u.add_argument("path", type=Path)
    sub.add_parser("status", help="Show the active rules and each article's review status")
    a = p.parse_args(argv)

    db = session_factory()()
    try:
        if a.cmd in ("review", "draft"):
            art = db.get(LibraryArticle, a.article_id)
            if art is None:
                print("No such article. Run `uv run python -m app.jobs.ingest_library` first.")
                return 1
            if a.cmd == "review":
                art.status, art.reviewer, art.review_date = "reviewed", a.reviewer, a.date
            else:
                art.status = "draft"
            db.add(AuditLog(user_id=None, action="library_review_cli", detail={"article": art.id, "status": art.status}))
            db.commit()
            print(f"{art.id}: {art.status}")
        elif a.cmd == "rules":
            text = a.path.read_text(encoding="utf-8")
            try:
                rules = Rules.from_yaml(text)
            except (RulesError, KeyError, TypeError) as e:
                print(f"Rejected: {e}")
                return 1
            if db.scalars(select(RulesVersion).where(RulesVersion.version == rules.version)).first():
                print("That version already exists. Change `version:` in the file.")
                return 1
            db.add(RulesVersion(version=rules.version, yaml_text=text))
            db.add(AuditLog(user_id=None, action="rules_upload_cli", detail={"version": rules.version, "status": rules.status}))
            db.commit()
            print(f"Active rules: {rules.version} ({rules.status})")
        else:
            rules = active_rules(db)
            print(f"Active rules: {rules.version} ({rules.status})")
            for art in db.scalars(select(LibraryArticle).order_by(LibraryArticle.id)):
                extra = f" by {art.reviewer} on {art.review_date}" if art.status == "reviewed" else ""
                print(f"  {art.status:9} {art.id}{extra}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
