"""The database layer works the same on SQLite (local development) and Postgres (production)."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.db import session_factory
from app.library import _cosine_distance
from app.main import _check_production
from app.models import AICall, CheckIn, User


def test_times_come_back_timezone_aware(api):
    api.post("/api/v1/rhythm/periods", json={"style_name": "Braids", "style_kind": "braids", "install_date": "2026-10-01"})
    assert api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "none"}}).json()["saved"]
    db = session_factory()()
    try:
        user = db.scalars(select(User)).one()
        checkin = db.scalars(select(CheckIn)).one()
        for value in (user.created_at, checkin.created_at):
            assert value.tzinfo is not None
            assert value.utcoffset().total_seconds() == 0
            assert abs((datetime.now(timezone.utc) - value).total_seconds()) < 120
    finally:
        db.close()


def test_ai_calls_are_logged_after_the_request(api):
    r = api.post("/api/v1/coach/ask", json={"question": "How often should I wash my hair?"})
    assert r.status_code == 200
    db = session_factory()()
    try:
        user = db.scalars(select(User)).one()
        n = db.scalar(select(func.count()).select_from(AICall).where(AICall.user_id == user.id))
        assert n >= 2  # at least moderation and the answer, written once the request's session closed
    finally:
        db.close()


def test_account_delete_cascades(api):
    api.post("/api/v1/rhythm/periods", json={"style_name": "Braids", "style_kind": "braids", "install_date": "2026-10-01"})
    api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "none"}})
    assert api.delete("/api/v1/me").status_code == 200
    db = session_factory()()
    try:
        assert db.scalar(select(func.count()).select_from(CheckIn)) == 0  # needs foreign keys on in SQLite
    finally:
        db.close()


def test_python_cosine_matches_pgvector_definition():
    assert _cosine_distance([1.0, 0.0], [1.0, 0.0]) == pytest.approx(0.0)
    assert _cosine_distance([1.0, 0.0], [0.0, 1.0]) == pytest.approx(1.0)
    assert _cosine_distance([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(2.0)
    assert _cosine_distance([3.0, 4.0], [6.0, 8.0]) == pytest.approx(0.0)


def _prod(**kw) -> Settings:
    base = dict(
        APP_ENV="production", AI_MODE="openai", OPENAI_API_KEY="sk-test", SESSION_SECRET="x" * 40, SAFETY_ID_SALT="salt",
        LIBRARY_INCLUDE_DRAFTS=False, FRONTEND_ORIGIN="https://crown.example",
        DATABASE_URL="postgresql+psycopg://crown:crown@db.example:5432/crown",
    )
    base.update(kw)
    return Settings(_env_file=None, **base)


def test_production_refuses_sqlite():
    _check_production(_prod())  # a sound production config starts
    with pytest.raises(RuntimeError, match="SQLite is for local development only"):
        _check_production(_prod(DATABASE_URL="sqlite:///var/crown.db"))


def test_relative_sqlite_path_is_inside_backend():
    s = Settings(_env_file=None, DATABASE_URL="sqlite:///var/crown.db")
    assert s.DATABASE_URL.startswith("sqlite:////") and s.DATABASE_URL.endswith("/backend/var/crown.db")


def test_queued_ai_call_rows_never_break_a_request():
    from app.ai.openai_client import _pending_calls, flush_ai_calls
    from app.core.db import uses_sqlite

    if not uses_sqlite():
        pytest.skip("rows are only queued on SQLite")
    # A row for an account that no longer exists fails its foreign key: it is dropped, not raised.
    ghost = uuid.uuid4()
    _pending_calls.append(AICall(user_id=ghost, feature="t", endpoint="t", model="fake", latency_ms=1.0, status="ok"))
    flush_ai_calls()
    assert not _pending_calls
    db = session_factory()()
    try:
        assert db.scalar(select(func.count()).select_from(AICall).where(AICall.user_id == ghost)) == 0
    finally:
        db.close()
