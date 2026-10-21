"""Per-user limits on AI routes so one account cannot run up the OpenAI bill.

The per-minute window is kept in process memory, which is enough for one API process.
Run several API processes behind a load balancer and you will want a shared store (Redis).
The monthly cap counts rows in ai_calls, so it holds across processes and restarts.
"""
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AICall, User

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def reset() -> None:
    with _lock:
        _hits.clear()


def check_ai_limits(db: Session, user: User) -> None:
    s = get_settings()
    key = str(user.id)
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= s.AI_RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "That's a lot of requests in a minute. Please wait a moment.")
        q.append(now)
    if s.AI_MONTHLY_CAP_PER_USER:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used = db.scalar(
            select(func.count()).select_from(AICall).where(AICall.user_id == user.id, AICall.created_at >= start)
        )
        if (used or 0) >= s.AI_MONTHLY_CAP_PER_USER:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "You've reached this month's limit for AI features. Routines and check-ins still work.",
            )
