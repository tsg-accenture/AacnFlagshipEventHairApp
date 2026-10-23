"""Test setup: a throwaway database, AI_MODE=fake, temp photo storage.

By default the tests use a new SQLite file in a temp folder, so nothing needs installing.
To run them against Postgres with pgvector instead, point TEST_DATABASE_URL at an empty database:
  TEST_DATABASE_URL=postgresql+psycopg://crown:crown@localhost:5432/crown_test uv run pytest
"""
import os
import shutil
import tempfile
from pathlib import Path

import pytest

TMP = Path(tempfile.mkdtemp(prefix="crown-test-"))
os.environ.update({
    "APP_ENV": "test",
    "AI_MODE": "fake",
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{TMP / 'test.db'}",
    "SESSION_SECRET": "test-secret-0123456789-abcdefghijklmnop",
    "SAFETY_ID_SALT": "test-salt",
    "LIBRARY_INCLUDE_DRAFTS": "true",
    "DEMO_PRODUCTS_ENABLED": "false",
    "STORAGE_DIR": str(TMP / "photos"),
    "AI_RATE_LIMIT_PER_MINUTE": "1000",
})

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import BACKEND_DIR, get_settings  # noqa: E402
from app.core.db import get_engine, session_factory, uses_sqlite  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def database():
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.downgrade(cfg, "base")  # start from empty tables (keeps the vector extension on Postgres)
    command.upgrade(cfg, "head")
    # Seed the draft library with fake embeddings.
    from app.ai.fake import FakeAI
    from app.ai.openai_client import flush_ai_calls
    from app.library import parse_article, upsert_article

    db = session_factory()()
    for f in sorted((get_settings().CONTENT_DIR / "library").glob("*.md")):
        upsert_article(db, FakeAI(db, None), parse_article(f))
    db.close()
    flush_ai_calls()
    yield
    get_engine().dispose()
    shutil.rmtree(TMP, ignore_errors=True)


USER_TABLES = [
    "ai_calls", "audit_log", "stylist_notes", "care_packs", "coach_messages", "care_plans", "zone_states",
    "observations", "photos", "assessment_zones", "assessments", "checkins", "style_periods", "reminders",
    "goals", "profiles", "consent_events", "sessions", "rules_versions", "users",
]


@pytest.fixture(autouse=True)
def clean():
    yield
    with get_engine().begin() as conn:
        if uses_sqlite():  # no TRUNCATE on SQLite; children are listed before the tables they point at
            for t in USER_TABLES:
                conn.execute(text(f"DELETE FROM {t}"))
        else:
            conn.execute(text("TRUNCATE " + ", ".join(USER_TABLES) + " CASCADE"))
    from app.core import ratelimit

    ratelimit.reset()


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


def csrf(client: TestClient) -> dict:
    return {"X-CSRF-Token": client.cookies.get("crown_csrf", "")}


class Api:
    """Small wrapper that adds the CSRF header to writes."""

    def __init__(self, client: TestClient):
        self.c = client

    def get(self, url, **kw):
        return self.c.get(url, **kw)

    def post(self, url, **kw):
        return self.c.post(url, headers=csrf(self.c), **kw)

    def put(self, url, **kw):
        return self.c.put(url, headers=csrf(self.c), **kw)

    def patch(self, url, **kw):
        return self.c.patch(url, headers=csrf(self.c), **kw)

    def delete(self, url, **kw):
        return self.c.delete(url, headers=csrf(self.c), **kw)


def make_user(app, email="ama@example.com", consents=("health_data",)) -> Api:
    client = TestClient(app)
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse battery", "display_name": "Ama", "confirm_adult": True})
    assert r.status_code == 201, r.text
    api = Api(client)
    for c in consents:
        assert api.put(f"/api/v1/consents/{c}", json={"granted": True}).status_code == 200
    return api


@pytest.fixture
def api(app) -> Api:
    return make_user(app)
