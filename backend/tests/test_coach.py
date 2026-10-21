import pytest

from app.ai import guard
from app.ai.coach import CoachAnswer
from app.ai.fake import FakeAI
from app.core.config import get_settings


def test_answer_cites_library(api):
    r = api.post("/api/v1/coach/ask", json={"question": "How tight should my braids be? My edges feel sore."})
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "answer", body
    assert body["sources"] and body["sources"][0]["sources"][0]["url"].startswith("https://")
    assert body["sources"][0]["status"] == "draft"  # LIBRARY_INCLUDE_DRAFTS=true in tests
    assert body["demo_ai"] is True
    hist = api.get("/api/v1/coach/history").json()
    assert hist[0]["question"].startswith("How tight")
    assert hist[0]["demo_ai"] is True  # past Demo AI answers keep their label


@pytest.mark.parametrize(
    "question, kind",
    [
        ("What's the best laptop to buy?", "out_of_scope"),
        ("My scalp is bleeding and there is pus near my braids", "see_someone_now"),
        ("I want to kill myself", "support"),
    ],
)
def test_triage_paths(api, question, kind):
    body = api.post("/api/v1/coach/ask", json={"question": question}).json()
    assert body["kind"] == kind
    if kind == "support":
        assert "116 123" in body["text"]


def test_no_reviewed_answer_when_drafts_excluded(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "LIBRARY_INCLUDE_DRAFTS", False)
    body = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"}).json()
    assert body["kind"] == "no_reviewed_answer"
    assert body["sources"] == []


def test_invented_citation_is_rejected(api, monkeypatch):
    original = FakeAI.parse

    def bad_parse(self, *, feature, schema, fake=None, **kw):
        if schema is CoachAnswer:
            return CoachAnswer(answer="Wash weekly.", cited_ids=[999999], action="Wash.", signpost=False)
        return original(self, feature=feature, schema=schema, fake=fake, **kw)

    monkeypatch.setattr(FakeAI, "parse", bad_parse)
    body = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"}).json()
    assert body["kind"] == "no_reviewed_answer"


def test_diagnostic_wording_is_rejected(api, monkeypatch):
    original = FakeAI.parse

    def diag(self, *, feature, schema, fake=None, **kw):
        if schema is CoachAnswer:
            got = fake()
            return CoachAnswer(answer="You have traction alopecia.", cited_ids=got.cited_ids, action="See a GP.", signpost=True)
        return original(self, feature=feature, schema=schema, fake=fake, **kw)

    monkeypatch.setattr(FakeAI, "parse", diag)
    body = api.post("/api/v1/coach/ask", json={"question": "My braids feel tight at the edges"}).json()
    assert body["kind"] == "no_reviewed_answer"


@pytest.mark.parametrize(
    "text, banned",
    [
        ("You have traction alopecia.", True),
        ("This looks like seborrhoeic dermatitis.", True),
        ("Traction alopecia is hair loss caused by constant pulling.", False),
        ("If your braids hurt, loosen them.", False),
        ("This will cure it.", True),
        ("We can confirm you are fine", True),
    ],
)
def test_banned_phrases(text, banned):
    assert (guard.banned_phrase(text) is not None) is banned


def test_citation_validator():
    assert guard.valid_citations([1, 2], {1, 2, 3})
    assert not guard.valid_citations([], {1})
    assert not guard.valid_citations([4], {1})


def test_admin_routes_need_advisor(api):
    assert api.get("/api/v1/admin/backlog").status_code == 403


def test_reembeds_when_model_changes_and_keeps_review():
    from app.core.db import session_factory
    from app.library import parse_article, upsert_article
    from app.models import LibraryArticle

    db = session_factory()()
    path = get_settings().CONTENT_DIR / "library" / "wash-day-basics.md"
    art = parse_article(path)
    row = db.get(LibraryArticle, "wash-day-basics")
    row.status, row.reviewer = "reviewed", "Dr Example"
    db.commit()
    assert upsert_article(db, FakeAI(db, None), art) == "unchanged"

    class OtherModel(FakeAI):
        @property
        def embed_model(self):
            return "other-model"

    assert upsert_article(db, OtherModel(db, None), art) == "updated"
    db.refresh(row)
    assert row.status == "reviewed" and {c.embedding_model for c in row.chunks} == {"other-model"}
    # put it back for other tests
    upsert_article(db, FakeAI(db, None), art)
    row.status, row.reviewer = "draft", None
    db.commit()
    db.close()
