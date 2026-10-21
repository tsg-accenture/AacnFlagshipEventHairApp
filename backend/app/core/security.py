"""Passwords, sessions, CSRF and the current-user dependency.

- Passwords: Argon2 via pwdlib (FastAPI security tutorial).
- Session: a PyJWT token in an httpOnly, SameSite=Lax cookie. The token names a row in
  `sessions`, so logout revokes it server-side.
- CSRF: double-submit token. The readable `crown_csrf` cookie must match the
  X-CSRF-Token header on every write once signed in.
"""
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import SessionToken, User

SESSION_COOKIE = "crown_session"
CSRF_COOKIE = "crown_csrf"
CSRF_HEADER = "x-csrf-token"
JWT_ALG = "HS256"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def safety_identifier(user_id: uuid.UUID | None) -> str | None:
    """Salted hash of the user ID for OpenAI's safety_identifier. Never an email or name."""
    if user_id is None:
        return None
    salt = get_settings().SAFETY_ID_SALT.encode()
    return hmac.new(salt, str(user_id).encode(), hashlib.sha256).hexdigest()[:64]


def start_session(db: Session, user: User, response: Response) -> None:
    s = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(days=s.SESSION_DAYS)
    row = SessionToken(user_id=user.id, expires_at=expires)
    db.add(row)
    db.commit()
    token = jwt.encode({"sid": str(row.id), "sub": str(user.id), "exp": expires}, s.SESSION_SECRET, algorithm=JWT_ALG)
    max_age = s.SESSION_DAYS * 24 * 3600
    response.set_cookie(
        SESSION_COOKIE, token, max_age=max_age, httponly=True, secure=s.cookie_secure, samesite="lax", path="/"
    )
    response.set_cookie(
        CSRF_COOKIE, secrets.token_urlsafe(32), max_age=max_age, httponly=False, secure=s.cookie_secure,
        samesite="lax", path="/",
    )


def end_session(db: Session, request: Request, response: Response) -> None:
    claims = _decode(request.cookies.get(SESSION_COOKIE))
    if claims:
        row = db.get(SessionToken, uuid.UUID(claims["sid"]))
        if row and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def _decode(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, get_settings().SESSION_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def check_csrf(request: Request) -> None:
    if request.method in SAFE_METHODS:
        return
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing or invalid CSRF token. Reload the page and try again.")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    claims = _decode(request.cookies.get(SESSION_COOKIE))
    if not claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    row = db.get(SessionToken, uuid.UUID(claims["sid"]))
    if (
        row is None
        or row.revoked_at is not None
        or row.expires_at <= datetime.now(timezone.utc)
        or str(row.user_id) != claims["sub"]
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has ended. Please sign in again.")
    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    check_csrf(request)
    return user


def advisor_user(user: User = Depends(current_user)) -> User:
    if user.role != "advisor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Advisor access only.")
    return user
