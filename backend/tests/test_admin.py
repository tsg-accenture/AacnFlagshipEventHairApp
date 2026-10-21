import yaml
from sqlalchemy import select

from app.core.db import session_factory
from app.models import User
from app.rules.engine import file_rules
from tests.conftest import make_user


def make_advisor(app):
    api = make_user(app, email="advisor@example.com")
    db = session_factory()()
    db.scalars(select(User).where(User.email == "advisor@example.com")).first().role = "advisor"
    db.commit()
    db.close()
    return api


def test_upload_rules_takes_effect(app):
    adv = make_advisor(app)
    data = dict(file_rules().data)
    data["version"] = "v2-test"
    data["checkin"] = dict(data["checkin"])
    data["checkin"]["outcomes"] = [{"id": "ALL-OK", "when": "always", "outcome": "all_good", "reason": "test"}]
    r = adv.c.put("/api/v1/admin/rules", content=yaml.safe_dump(data), headers={"X-CSRF-Token": adv.c.cookies.get("crown_csrf"), "Content-Type": "text/yaml"})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == "v2-test"
    res = adv.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "hurts"}}).json()
    assert res["outcome"] == "all_good" and res["rules_version"] == "v2-test"
    # malformed rules are rejected and never go live
    bad = adv.c.put("/api/v1/admin/rules", content="version: x\n", headers={"X-CSRF-Token": adv.c.cookies.get("crown_csrf")})
    assert bad.status_code == 422


def test_review_needs_reviewer_and_date(app):
    adv = make_advisor(app)
    assert adv.patch("/api/v1/admin/library/wash-day-basics", json={"status": "reviewed"}).status_code == 422
    r = adv.patch("/api/v1/admin/library/wash-day-basics", json={"status": "reviewed", "reviewer": "Dr Example", "review_date": "2026-10-20"})
    assert r.status_code == 200 and r.json()["status"] == "reviewed"
    adv.patch("/api/v1/admin/library/wash-day-basics", json={"status": "draft"})


def test_backlog_lists_unanswered_questions(app, monkeypatch):
    from app.core.config import get_settings

    adv = make_advisor(app)
    monkeypatch.setattr(get_settings(), "LIBRARY_INCLUDE_DRAFTS", False)
    adv.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"})
    assert adv.get("/api/v1/admin/backlog").json()[0]["question"].startswith("How often")
