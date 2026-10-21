"""Database engine and sessions.

Two databases are supported, chosen by DATABASE_URL:
- SQLite (the default for local development): a single file, built into Python, nothing to install.
- Postgres with pgvector (production, or locally if you prefer): see the README.
"""
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def is_sqlite_url(url: str) -> bool:
    return make_url(url).get_backend_name() == "sqlite"


def uses_sqlite() -> bool:
    return is_sqlite_url(get_settings().DATABASE_URL)


def _sqlite_pragmas(dbapi_conn: Any, _record: Any) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")  # SQLite ignores ON DELETE CASCADE without this
    cur.execute("PRAGMA journal_mode=WAL")  # readers don't block the writer
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        url = get_settings().DATABASE_URL
        if is_sqlite_url(url):
            db_file = make_url(url).database
            if db_file and db_file != ":memory:":
                Path(db_file).parent.mkdir(parents=True, exist_ok=True)
            # timeout: wait up to 30 s for another writer instead of failing at once
            _engine = create_engine(url, connect_args={"timeout": 30})
            event.listen(_engine, "connect", _sqlite_pragmas)
        else:
            _engine = create_engine(url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Iterator[Session]:
    db = session_factory()()
    try:
        yield db
    finally:
        db.close()
        # On SQLite, AI-call log rows wait until the request's session has let go of the database.
        from app.ai.openai_client import flush_ai_calls

        flush_ai_calls()
