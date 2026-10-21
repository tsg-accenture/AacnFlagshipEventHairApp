import io
import json
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.db import session_factory
from app.models import AuditLog, CheckIn, ConsentEvent, User
from tests.conftest import Api, make_user


def test_register_requires_adult(app):
    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "long enough pw", "confirm_adult": False})
    assert r.status_code == 422


def test_register_login_logout(app):
    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={"email": "Ama@Example.com", "password": "long enough pw", "confirm_adult": True})
    assert r.status_code == 201
    assert r.json()["email"] == "ama@example.com"
    assert "httponly" in r.headers["set-cookie"].lower()
    assert c.get("/api/v1/me").status_code == 200
    # duplicate
    assert TestClient(app).post("/api/v1/auth/register", json={"email": "ama@example.com", "password": "long enough pw",
                                                               "confirm_adult": True}).status_code == 409
    api = Api(c)
    token = c.cookies.get("crown_session")
    assert api.post("/api/v1/auth/logout").status_code == 200
    # the old token is revoked server-side even if replayed
    replay = TestClient(app)
    replay.cookies.set("crown_session", token)
    assert replay.get("/api/v1/me").status_code == 401
    # login again
    c2 = TestClient(app)
    assert c2.post("/api/v1/auth/login", json={"email": "ama@example.com", "password": "wrong password"}).status_code == 401
    assert c2.post("/api/v1/auth/login", json={"email": "ama@example.com", "password": "long enough pw"}).status_code == 200


def test_csrf_required_on_writes(app):
    api = make_user(app, consents=())
    r = api.c.put("/api/v1/consents/health_data", json={"granted": True})  # no header
    assert r.status_code == 403
    assert api.put("/api/v1/consents/health_data", json={"granted": True}).status_code == 200


def test_consent_ledger_is_append_only(app):
    api = make_user(app, consents=())
    for g in (True, False, True):
        api.put("/api/v1/consents/analysis", json={"granted": g})
    state = api.get("/api/v1/consents").json()
    assert state["state"]["analysis"]["granted"] is True
    assert state["state"]["analysis"]["wording_version"] == state["receipt"]["version"]
    db = session_factory()()
    n = db.scalar(select(func.count()).select_from(ConsentEvent).where(ConsentEvent.consent_type == "analysis"))
    db.close()
    assert n == 3
    assert api.put("/api/v1/consents/nonsense", json={"granted": True}).status_code == 404


def test_export_and_delete(app):
    api = make_user(app)
    api.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "none"}})
    r = api.get("/api/v1/me/export")
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    data = json.loads(z.read("data.json"))
    assert data["user"]["email"] == "ama@example.com"
    assert "password_hash" not in data["user"]
    assert len(data["checkins"]) == 1

    other = make_user(app, email="other@example.com")
    other.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "none"}})

    assert api.delete("/api/v1/me").status_code == 200
    db = session_factory()()
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(func.count()).select_from(CheckIn)) == 1  # only the other user's
    assert db.scalars(select(AuditLog).where(AuditLog.action == "account_deleted")).first() is not None
    db.close()
    assert api.get("/api/v1/me").status_code == 401
