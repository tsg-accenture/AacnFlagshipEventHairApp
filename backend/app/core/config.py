"""Typed settings read from backend/.env (pydantic-settings).

Only this service reads OPENAI_API_KEY. Nothing here is ever sent to the browser.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True)

    # Where the app runs. "development" relaxes cookie Secure flags for http://localhost.
    APP_ENV: Literal["development", "production", "test"] = "development"

    # AI_MODE=auto   uses OpenAI when OPENAI_API_KEY is set, and Demo AI when it's blank (the default).
    # AI_MODE=openai always calls the real API (AI features are off without a key).
    # AI_MODE=fake   always uses Demo AI: deterministic canned replies, even if a key is set.
    AI_MODE: Literal["auto", "openai", "fake"] = "auto"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL_VISION: str = "gpt-6.1-sol"
    OPENAI_MODEL_TEXT: str = "gpt-6-luna"
    OPENAI_MODEL_DECISIONS: str = "gpt-6-luna"
    OPENAI_MODEL_EMBEDDINGS: str = "text-embedding-3-small"
    OPENAI_MODEL_MODERATION: str = "omni-moderation-latest"
    # Phase 6 (not used in v1-base, kept so the .env matches the plan)
    OPENAI_MODEL_TRANSCRIBE: str = "gpt-transcribe"
    OPENAI_MODEL_TTS: str = "gpt-4o-mini-tts"
    OPENAI_MODEL_IMAGE: str = "gpt-image-2.5-flare"
    OPENAI_REASONING_EFFORT_VISION: Literal["minimal", "low", "medium", "high"] = "low"
    OPENAI_REASONING_EFFORT_TEXT: Literal["none", "minimal", "low", "medium", "high"] = "low"
    OPENAI_TIMEOUT_SECONDS: float = 60.0
    EMBEDDING_DIMENSIONS: int = 1536

    SAFETY_ID_SALT: str = "change-me"
    # Local development uses SQLite: one file, nothing to install. Production uses Postgres with pgvector,
    # e.g. postgresql+psycopg://crown:crown@localhost:5432/crown (see the README).
    DATABASE_URL: str = Field(default="sqlite:///var/crown.db", validate_default=True)
    STORAGE_BACKEND: Literal["local"] = "local"
    STORAGE_DIR: Path = BACKEND_DIR / "var" / "photos"
    S3_BUCKET: str = ""
    S3_REGION: str = "eu-west-2"
    SESSION_SECRET: str = "change-me"
    SESSION_DAYS: int = 14
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # Cost and abuse limits
    AI_MONTHLY_CAP_PER_USER: int | None = None  # blank = no cap; set after the Phase 3 cost check
    AI_RATE_LIMIT_PER_MINUTE: int = 20
    MAX_UPLOAD_MB: int = 12

    # Content
    CONTENT_DIR: Path = REPO_DIR / "content"
    # Development only: let the Coach and reports cite library passages still marked "draft".
    # Must be false for real users: only advisor-reviewed passages may be cited.
    LIBRARY_INCLUDE_DRAFTS: bool = False
    COACH_MIN_SIMILARITY: float = Field(default=0.30, ge=0.0, le=1.0)
    DEMO_PRODUCTS_ENABLED: bool = False

    @field_validator("DATABASE_URL")
    @classmethod
    def _anchor_sqlite_path(cls, v: str) -> str:
        """A relative SQLite path means "inside backend/", wherever the command is run from."""
        prefix = "sqlite:///"
        if v.startswith(prefix):
            path = v[len(prefix):]
            if path and path != ":memory:" and not Path(path).is_absolute():
                return prefix + str((BACKEND_DIR / path).resolve())
        return v

    @property
    def cookie_secure(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def uses_demo_ai(self) -> bool:
        """True when AI replies come from Demo AI (app/ai/fake.py) rather than OpenAI."""
        return self.AI_MODE == "fake" or (self.AI_MODE == "auto" and not self.OPENAI_API_KEY)

    @property
    def effective_ai_mode(self) -> Literal["openai", "fake"]:
        return "fake" if self.uses_demo_ai else "openai"

    @property
    def ai_enabled(self) -> bool:
        return self.uses_demo_ai or bool(self.OPENAI_API_KEY)

    @property
    def demo_products_enabled(self) -> bool:
        """Demo products are opt-in and can never be enabled in production."""
        return self.DEMO_PRODUCTS_ENABLED and self.APP_ENV != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
