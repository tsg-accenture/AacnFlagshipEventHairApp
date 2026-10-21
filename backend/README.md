# Crown AI backend (FastAPI)

Setup, run and test instructions are in the [main README](../README.md).

```bash
cp .env.example .env                              # then set SESSION_SECRET and SAFETY_ID_SALT (openssl rand -hex 32)
uv sync
uv run alembic upgrade head
uv run python -m app.jobs.ingest_library
uv run uvicorn app.main:app --reload --port 8000  # API docs: http://localhost:8000/api/docs
uv run pytest
```

The database is a SQLite file at `backend/var/crown.db` unless `DATABASE_URL` points at Postgres (see the main README). This is the only service that reads `OPENAI_API_KEY`, the database and stored photos.
