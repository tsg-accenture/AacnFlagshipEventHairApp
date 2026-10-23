import pytest
from sqlalchemy import select

from app.ai import guard
from app.ai.coach import CoachAnswer
from app.ai.fake import FakeAI
from app.core.config import get_settings
from app.core.db import session_factory
from app.models import CoachMessage, User
from app.services.demo_products import (
    DISCLAIMER,
    demo_products_payload,
    eligible_for_demo_products,
    serialize_coach_answer,
)


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


def test_demo_products_fixture_is_exact_and_independent():
    payload = demo_products_payload()
    assert payload["version"] == "v1" and payload["is_demo"] is True
    assert payload["disclaimer"] == DISCLAIMER
    assert [item["id"] for item in payload["items"]] == [
        "demo-gentle-cleanse",
        "demo-soft-touch",
        "demo-lightweight-moisture",
    ]
    assert [(item["name"], item["brand"], item["description"], item["ownership_badge"]) for item in payload["items"]] == [
        ("Gentle Cleanse Shampoo", "Demo Crown Care A", "Fictional example of a shampoo for routine cleansing.", "black owned"),
        ("Soft Touch Conditioner", "Demo Crown Care B", "Fictional example of a rinse-out conditioner for a regular wash routine.", "black owned"),
        ("Lightweight Moisture Spray", "Demo Crown Care C", "Fictional example of a lightweight spray for a general moisture routine.", None),
    ]
    assert all(item["is_demo"] is True for item in payload["items"])
    payload["items"].clear()
    assert len(demo_products_payload()["items"]) == 3


def test_relevant_valid_citations_attach_demo_products(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    response = api.post(
        "/api/v1/coach/ask",
        json={
            "question": (
                "My hairline is thinning after wearing protective styles. What should I do, when should I seek "
                "professional help, and can you suggest three Black owned products?"
            )
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "answer"
    assert body["demo_products"]["disclaimer"] == DISCLAIMER
    assert len(body["demo_products"]["items"]) == 3
    assert body["signpost"] is True
    assert body["professional_guidance"]
    assert body["action"]
    assert any(
        source["article_id"] in {"tight-styles-and-your-edges", "early-changes", "signs-a-style-is-too-tight"}
        for source in body["sources"]
    )
    assert any(link["url"].startswith("https://") for link in body["links"])
    assert body["sources"]
    assert "looser" in body["text"].lower() or "pull" in body["text"].lower()


def test_demo_product_prompt_context_is_conditional_and_not_a_promise(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    captured = {}
    original = FakeAI.parse

    def capture_parse(self, *, feature, schema, fake=None, instructions="", **kw):
        if schema is CoachAnswer:
            captured["instructions"] = instructions
            return fake()
        return original(self, feature=feature, schema=schema, fake=fake, instructions=instructions, **kw)

    monkeypatch.setattr(FakeAI, "parse", capture_parse)
    body = api.post(
        "/api/v1/coach/ask",
        json={"question": "My hairline is thinning after protective styles. What should I do?"},
    ).json()
    assert body["kind"] == "answer" and "demo_products" in body
    instructions = captured["instructions"]
    assert "Do not promise a shelf" in instructions
    assert "Do not" in instructions and "assert real ownership" in instructions


def test_demo_products_are_off_by_default(api):
    body = api.post(
        "/api/v1/coach/ask",
        json={"question": "My hairline is thinning after protective styles. What should I do?"},
    ).json()
    assert body["kind"] == "answer"
    assert "demo_products" not in body


def test_demo_products_are_suppressed_after_disable_without_mutating_history(api, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "DEMO_PRODUCTS_ENABLED", True)
    body = api.post(
        "/api/v1/coach/ask",
        json={"question": "My hairline is thinning after protective styles. What should I do?"},
    ).json()
    assert "demo_products" in body

    db = session_factory()()
    try:
        message = db.scalar(select(CoachMessage).order_by(CoachMessage.created_at.desc()))
        assert message is not None
        stored_answer = dict(message.answer)
        assert "demo_products" in stored_answer
        message_uuid = message.id
        message_id = str(message_uuid)
    finally:
        db.close()

    monkeypatch.setattr(settings, "DEMO_PRODUCTS_ENABLED", False)
    history = api.get("/api/v1/coach/history").json()
    saved = next(row for row in history if row["id"] == message_id)
    assert "demo_products" not in saved

    db = session_factory()()
    try:
        unchanged = db.scalar(select(CoachMessage).where(CoachMessage.id == message_uuid))
        assert unchanged is not None and unchanged.answer == stored_answer
    finally:
        db.close()


def test_demo_products_require_effective_answer_and_citations():
    relevant = {"tight-styles-and-your-edges"}
    assert eligible_for_demo_products(kind="answer", cited_article_ids=relevant, enabled=True)
    assert not eligible_for_demo_products(kind="answer", cited_article_ids=set(), enabled=True)
    assert not eligible_for_demo_products(kind="answer", cited_article_ids=relevant | {"hair-loss-and-how-you-feel"}, enabled=True)
    assert not eligible_for_demo_products(kind="support", cited_article_ids=relevant, enabled=True)
    assert not eligible_for_demo_products(kind="answer", cited_article_ids=relevant, enabled=False)


def test_history_suppresses_payload_on_non_answer(api, monkeypatch):
    db = session_factory()()
    try:
        user = db.scalar(select(User))
        assert user is not None
        saved = demo_products_payload()
        message = CoachMessage(
            user_id=user.id,
            question="Historical support response",
            kind="support",
            answer={"kind": "support", "text": "Support response.", "demo_products": saved},
            cited_chunk_ids=[],
        )
        db.add(message)
        db.commit()
        message_id = str(message.id)
    finally:
        db.close()

    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    history = api.get("/api/v1/coach/history").json()
    historical = next(row for row in history if row["id"] == message_id)
    assert historical["kind"] == "support"
    assert "demo_products" not in historical


def test_history_keeps_legacy_answer_without_demo_payload(api):
    db = session_factory()()
    try:
        user = db.scalar(select(User))
        assert user is not None
        message = CoachMessage(
            user_id=user.id,
            question="Legacy question",
            kind="answer",
            answer={
                "kind": "answer",
                "text": "A saved answer from before the demo shelf.",
                "action": "Read its source.",
                "sources": [],
                "cited": [],
            },
            cited_chunk_ids=[],
        )
        db.add(message)
        db.commit()
        message_id = str(message.id)
    finally:
        db.close()

    history = api.get("/api/v1/coach/history").json()
    legacy = next(row for row in history if row["id"] == message_id)
    assert legacy["kind"] == "answer"
    assert legacy["text"] == "A saved answer from before the demo shelf."
    assert legacy["action"] == "Read its source."
    assert "demo_products" not in legacy


@pytest.mark.parametrize(
    "question, kind",
    [
        ("What's the best laptop to buy?", "out_of_scope"),
        ("My scalp is bleeding and there is pus near my braids", "see_someone_now"),
        ("I want to kill myself", "support"),
    ],
)
def test_triage_paths(api, question, kind, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    body = api.post("/api/v1/coach/ask", json={"question": question}).json()
    assert body["kind"] == kind
    assert "demo_products" not in body
    if kind == "support":
        assert "116 123" in body["text"]


def test_no_reviewed_answer_when_drafts_excluded(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "LIBRARY_INCLUDE_DRAFTS", False)
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    body = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"}).json()
    assert body["kind"] == "no_reviewed_answer"
    assert body["sources"] == []
    assert "demo_products" not in body


def test_invented_citation_is_rejected(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    original = FakeAI.parse

    def bad_parse(self, *, feature, schema, fake=None, **kw):
        if schema is CoachAnswer:
            return CoachAnswer(answer="Wash weekly.", cited_ids=[999999], action="Wash.", signpost=False, professional_guidance="")
        return original(self, feature=feature, schema=schema, fake=fake, **kw)

    monkeypatch.setattr(FakeAI, "parse", bad_parse)
    body = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"}).json()
    assert body["kind"] == "no_reviewed_answer"
    assert "demo_products" not in body


def test_diagnostic_wording_is_rejected(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "DEMO_PRODUCTS_ENABLED", True)
    original = FakeAI.parse

    def diag(self, *, feature, schema, fake=None, **kw):
        if schema is CoachAnswer:
            got = fake()
            return CoachAnswer(answer="You have traction alopecia.", cited_ids=got.cited_ids, action="See a GP.", signpost=True, professional_guidance="")
        return original(self, feature=feature, schema=schema, fake=fake, **kw)

    monkeypatch.setattr(FakeAI, "parse", diag)
    body = api.post("/api/v1/coach/ask", json={"question": "My braids feel tight at the edges"}).json()
    assert body["kind"] == "no_reviewed_answer"
    assert "demo_products" not in body


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
