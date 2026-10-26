"""Which AI the backend uses, and that it says so (a key must never be silently ignored)."""
import logging

import pytest
from sqlalchemy import delete, func, select

from app.ai.fake import FakeAI
from app.ai.openai_client import AIClient, describe_error, flush_ai_calls, get_ai
from app.core.config import Settings, get_settings
from app.core.db import session_factory
from app.library import is_embedded_for, refresh_library
from app.main import _check_production, announce_ai
from app.models import AICall, LibraryChunk


def settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


@pytest.mark.parametrize(
    "mode, key, demo, enabled",
    [
        ("auto", "", True, True),  # no key: Demo AI
        ("auto", "sk-test", False, True),  # key: OpenAI
        ("fake", "sk-test", True, True),  # forced Demo AI, key ignored
        ("openai", "", False, False),  # forced OpenAI with no key: AI is off
        ("openai", "sk-test", False, True),
    ],
)
def test_ai_mode_rules(mode, key, demo, enabled):
    s = settings(AI_MODE=mode, OPENAI_API_KEY=key)
    assert s.uses_demo_ai is demo
    assert s.effective_ai_mode == ("fake" if demo else "openai")
    assert s.ai_enabled is enabled


def test_auto_is_the_default(monkeypatch):
    monkeypatch.delenv("AI_MODE", raising=False)  # the test run itself sets AI_MODE=fake
    assert settings().AI_MODE == "auto"


def test_demo_products_are_opt_in_non_production_and_independent_of_ai_mode():
    assert settings().DEMO_PRODUCTS_ENABLED is False
    assert settings(AI_MODE="fake", DEMO_PRODUCTS_ENABLED=True).demo_products_enabled is True
    assert settings(AI_MODE="openai", OPENAI_API_KEY="sk-test", DEMO_PRODUCTS_ENABLED=True).demo_products_enabled is True
    assert settings(APP_ENV="production", DEMO_PRODUCTS_ENABLED=True).demo_products_enabled is False


def test_get_ai_follows_the_key(monkeypatch):
    s = get_settings()
    db = session_factory()()
    try:
        monkeypatch.setattr(s, "AI_MODE", "auto")
        monkeypatch.setattr(s, "OPENAI_API_KEY", "")
        assert isinstance(get_ai(db, None), FakeAI)
        monkeypatch.setattr(s, "OPENAI_API_KEY", "sk-test")
        assert isinstance(get_ai(db, None), AIClient)
        monkeypatch.setattr(s, "AI_MODE", "fake")
        assert isinstance(get_ai(db, None), FakeAI)
    finally:
        db.close()


def test_unused_key_is_announced(caplog):
    with caplog.at_level(logging.WARNING, logger="crown"):
        msg = announce_ai(settings(AI_MODE="fake", OPENAI_API_KEY="sk-test"))
    assert "set but NOT used" in msg and "AI_MODE=auto" in msg
    assert any("NOT used" in r.getMessage() for r in caplog.records)
    assert "sk-test" not in caplog.text  # the key itself is never logged
    assert announce_ai(settings(AI_MODE="auto", OPENAI_API_KEY="sk-test")).startswith("AI: OpenAI")
    assert announce_ai(settings(AI_MODE="auto")).startswith("AI: Demo AI")


def test_health_reports_the_ai_in_use(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "OPENAI_API_KEY", "")
    h = api.get("/api/v1/health").json()
    assert h["ai_mode"] == "fake" and h["ai_mode_setting"] == "fake"
    assert h["openai_key_set"] is False
    assert h["library_ready"] is True  # the test library is embedded with Demo AI
    assert h["demo_products_enabled"] is False


def test_production_refuses_demo_ai_without_a_key():
    good = dict(APP_ENV="production", SESSION_SECRET="x" * 40, SAFETY_ID_SALT="salt", LIBRARY_INCLUDE_DRAFTS=False,
                FRONTEND_ORIGIN="https://crown.example", DATABASE_URL="postgresql+psycopg://u:p@db.example:5432/crown")
    _check_production(settings(AI_MODE="auto", OPENAI_API_KEY="sk-test", **good))
    with pytest.raises(RuntimeError, match="Demo AI is on"):
        _check_production(settings(AI_MODE="auto", **good))


def test_library_refresh_re_embeds_only_what_is_missing():
    db = session_factory()()
    try:
        ai = FakeAI(db, None)
        assert is_embedded_for(db, ai.embed_model)
        assert not is_embedded_for(db, "text-embedding-3-small")  # what OpenAI would need after a switch
        art_id = db.scalar(select(LibraryChunk.article_id).limit(1))
        db.execute(delete(LibraryChunk).where(LibraryChunk.article_id == art_id))
        db.commit()
        before = db.scalar(select(func.count()).select_from(AICall).where(AICall.endpoint == "embeddings"))
        counts = refresh_library(db, ai)
        flush_ai_calls()
        after = db.scalar(select(func.count()).select_from(AICall).where(AICall.endpoint == "embeddings"))
        assert counts["updated"] == 1 and counts["created"] == 0
        assert after - before == 1  # one embedding call, for the one article that needed it
        assert db.scalar(select(func.count()).select_from(LibraryChunk).where(LibraryChunk.article_id == art_id)) > 0
    finally:
        db.close()


class _FakeOpenAIError(Exception):
    status_code = 404
    body = {"error": {"message": "The model `gpt-x` does not exist or you do not have access to it.", "code": "model_not_found"}}


def test_errors_are_described_without_content():
    text = describe_error(_FakeOpenAIError())
    assert text.startswith("_FakeOpenAIError") and "HTTP 404" in text and "does not exist" in text
    assert describe_error(ValueError()) == "ValueError"
