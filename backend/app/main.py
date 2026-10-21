"""Crown AI API. Run: uv run uvicorn app.main:app --reload --port 8000"""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.ai.openai_client import AIServiceError, AIUnavailable, flush_ai_calls, get_ai
from app.api.v1 import account, admin, assessments, coach, routine, sharing
from app.core.config import get_settings
from sqlalchemy.orm import Session

from app.core.db import get_db, is_sqlite_url, session_factory
from app.library import is_embedded_for, refresh_library
from app.rules.engine import active_rules

# Never log request bodies: they can hold health details and photos.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

log = logging.getLogger("crown")
settings = get_settings()


def _check_production(s) -> None:
    """Refuse to start a production server with development shortcuts still switched on."""
    problems = []
    if s.SESSION_SECRET in ("", "change-me") or len(s.SESSION_SECRET) < 32:
        problems.append("SESSION_SECRET must be a long random value")
    if s.SAFETY_ID_SALT in ("", "change-me"):
        problems.append("SAFETY_ID_SALT must be set")
    if s.uses_demo_ai:
        problems.append("Demo AI is on (AI_MODE=fake, or AI_MODE=auto with no OPENAI_API_KEY): it is for trying the app only")
    if s.LIBRARY_INCLUDE_DRAFTS:
        problems.append("LIBRARY_INCLUDE_DRAFTS must be false: only reviewed passages may be cited")
    if not s.FRONTEND_ORIGIN.startswith("https://"):
        problems.append("FRONTEND_ORIGIN must be https")
    if is_sqlite_url(s.DATABASE_URL):
        problems.append("DATABASE_URL must point at Postgres with pgvector: SQLite is for local development only")
    if problems:
        raise RuntimeError("Not safe for APP_ENV=production: " + "; ".join(problems))


if settings.APP_ENV == "production":
    _check_production(settings)

def announce_ai(s) -> str:
    """Logs which AI the backend is using, so a key that isn't being used can't go unnoticed."""
    if s.uses_demo_ai and s.OPENAI_API_KEY:
        msg = ("AI: Demo AI, because AI_MODE=fake. Your OPENAI_API_KEY is set but NOT used. "
               "To call OpenAI, set AI_MODE=auto (or openai) in backend/.env and restart the backend.")
        log.warning(msg)
    elif s.uses_demo_ai:
        msg = "AI: Demo AI (no OPENAI_API_KEY in backend/.env). Replies are canned, not from OpenAI."
        log.info(msg)
    elif s.OPENAI_API_KEY:
        msg = (f"AI: OpenAI at {s.OPENAI_BASE_URL}. Models: text {s.OPENAI_MODEL_TEXT}, vision {s.OPENAI_MODEL_VISION}, "
               f"decisions {s.OPENAI_MODEL_DECISIONS}, embeddings {s.OPENAI_MODEL_EMBEDDINGS}, "
               f"moderation {s.OPENAI_MODEL_MODERATION}. Each call is logged as it happens.")
        log.info(msg)
    else:
        msg = "AI: off. AI_MODE=openai but OPENAI_API_KEY is blank in backend/.env."
        log.warning(msg)
    return msg


def refresh_library_now() -> None:
    """Development convenience: (re-)embeds the library for the AI in use, e.g. after adding a key.

    Unchanged articles already embedded with the current model are skipped without any AI call.
    """
    db = session_factory()()
    try:
        try:
            ai = get_ai(db, None)
        except AIUnavailable as e:
            log.warning("Library not embedded: %s", e)
            return
        counts = refresh_library(db, ai)
        if counts["created"] or counts["updated"]:
            log.info("Library embedded with %s: %d new, %d updated, %d unchanged.", ai.embed_model,
                     counts["created"], counts["updated"], counts["unchanged"])
    except AIServiceError as e:
        log.error("Couldn't embed the library (%s). The Hair Coach can't find passages until it is: "
                  "check the key, model names and network in backend/.env, then restart the backend.", e)
    except Exception:  # noqa: BLE001 - never stop the server over this
        log.exception("Library refresh failed")
    finally:
        db.close()
        flush_ai_calls()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    s = get_settings()
    announce_ai(s)
    if s.APP_ENV == "development":
        # In the background, so the server answers at once; the Coach can cite passages when it's done.
        threading.Thread(target=refresh_library_now, name="library-refresh", daemon=True).start()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Crown AI API",
    version="0.1.0",
    description="Accounts, consent, Hair Rhythm, rules, Hair Coach and photo checks. The only service that holds the OpenAI key.",
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.APP_ENV != "production" else None,
)


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/v1/") and "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(SecurityHeaders)
# Browsers reach the API through the Next.js /api rewrite (same origin). CORS only allows the app's own origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

@app.exception_handler(AIServiceError)
async def ai_service_error(request: Request, exc: AIServiceError) -> JSONResponse:
    # Most often a wrong OPENAI_API_KEY or an OpenAI outage. Details are in the server log, not the response.
    return JSONResponse(
        status_code=503,
        content={"detail": {"code": "ai_error", "message": "The AI service didn't respond. Please try again in a minute."}},
    )


for module in (account, routine, coach, assessments, sharing, admin):
    app.include_router(module.router, prefix="/api/v1")


@app.get("/api/v1/health")
def health(db: Session = Depends(get_db)) -> dict:
    s = get_settings()
    rules = active_rules(db)
    try:
        library_ready = is_embedded_for(db, get_ai(db, None).embed_model)
    except AIUnavailable:
        library_ready = False
    return {
        "status": "ok",
        "app_env": s.APP_ENV,
        "ai_mode": s.effective_ai_mode,  # what is actually used: "openai" or "fake" (Demo AI)
        "ai_mode_setting": s.AI_MODE,
        "openai_key_set": bool(s.OPENAI_API_KEY),
        "ai_enabled": s.ai_enabled,
        "library_ready": library_ready,
        "rules_version": rules.version,
        "rules_status": rules.status,
        "library_includes_drafts": s.LIBRARY_INCLUDE_DRAFTS,
    }
