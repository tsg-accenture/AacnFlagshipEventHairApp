import io
from pathlib import Path

from PIL import Image

from app.core.config import get_settings
from tests.conftest import make_user


def jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (2400, 1800), (60, 40, 30))
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (51.0, 28.0, 0.0)}  # GPSInfo
    exif[0x010F] = "PhoneMaker"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def start_check(api, zones=("hairline", "crown"), answers=None):
    r = api.post("/api/v1/assessments", json={"zones": list(zones), "answers": answers or {}})
    assert r.status_code == 201, r.text
    return r.json()


def test_questions_only_check(api):
    a = start_check(api, answers={"hairline": {"tender": "yes", "bumps": "yes"}, "crown": {"tender": "no", "change": "no"}})
    done = api.post(f"/api/v1/assessments/{a['id']}/run").json()
    states = {z["zone"]: z["rules_state"]["state"] for z in done["zones"]}
    assert states == {"hairline": "get_checked", "crown": "calm"}
    m = api.get("/api/v1/map").json()
    by = {z["zone"]: z["state"] for z in m["zones"]}
    assert by["hairline"] == "get_checked" and by["nape"] == "not_checked"
    # A zone on Get checked shows up on Today and the referrals page
    assert "get_checked" in [c["type"] for c in api.get("/api/v1/rhythm/today").json()["cards"]]


def test_photo_needs_analysis_consent(api):
    a = start_check(api)
    r = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "hairline"},
                 files={"file": ("p.jpg", jpeg_with_gps(), "image/jpeg")})
    assert r.status_code == 403


def test_photo_is_stripped_of_exif_and_owner_only(app):
    api = make_user(app, consents=("health_data", "analysis", "photo_retention"))
    a = start_check(api, zones=("hairline",))
    r = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "hairline"},
                 files={"file": ("p.jpg", jpeg_with_gps(), "image/jpeg")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["quality"]["checked"] is True and body["kept"] is True and body["described"] is True
    pid = body["photo_id"]
    stored = api.get(f"/api/v1/photos/{pid}")
    assert stored.status_code == 200 and stored.headers["cache-control"] == "private, no-store"
    img = Image.open(io.BytesIO(stored.content))
    assert max(img.size) == 1600
    assert not img.getexif()  # no EXIF, so no location
    other = make_user(app, email="other@example.com")
    assert other.get(f"/api/v1/photos/{pid}").status_code == 404
    done = api.post(f"/api/v1/assessments/{a['id']}/run").json()
    z = done["zones"][0]
    assert z["ai_observed"]["data"]["looks_thinner"] == "cant_tell"
    assert z["rules_state"]["state"] in ("calm", "watch", "get_checked", "not_checked")
    assert z["explanation"]["text"]
    # running twice is safe: no duplicate states
    again = api.post(f"/api/v1/assessments/{a['id']}/run").json()
    assert len(again["zones"]) == 1


def _files_on_disk() -> list[Path]:
    root = Path(get_settings().STORAGE_DIR)
    return list(root.rglob("*.jpg")) if root.exists() else []


def test_without_retention_the_file_is_never_stored(app):
    api = make_user(app, consents=("health_data", "analysis"))  # no photo_retention
    before = set(_files_on_disk())
    a = start_check(api, zones=("crown",))
    body = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "crown"},
                    files={"file": ("p.jpg", jpeg_with_gps(), "image/jpeg")}).json()
    assert body["kept"] is False and body["described"] is True
    assert set(_files_on_disk()) == before  # nothing written, even if the check is never finished
    assert api.get(f"/api/v1/photos/{body['photo_id']}").status_code == 404
    done = api.post(f"/api/v1/assessments/{a['id']}/run").json()
    assert done["zones"][0]["ai_observed"] is not None  # the description made at upload was used
    assert done["zones"][0]["photo"]["kept"] is False


def test_new_check_discards_unfinished_one(app):
    api = make_user(app, consents=("health_data", "analysis", "photo_retention"))
    a = start_check(api, zones=("nape",))
    pid = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "nape"},
                   files={"file": ("p.png", _png(), "image/png")}).json()["photo_id"]
    assert api.get(f"/api/v1/photos/{pid}").status_code == 200
    start_check(api, zones=("crown",))  # abandons the first
    assert api.get(f"/api/v1/photos/{pid}").status_code == 404
    assert api.get(f"/api/v1/assessments/{a['id']}").status_code == 404


def test_discard_a_check(api):
    a = start_check(api, answers={"crown": {"tender": "no"}})
    api.post(f"/api/v1/assessments/{a['id']}/run")
    assert api.delete(f"/api/v1/assessments/{a['id']}").status_code == 200
    assert api.get(f"/api/v1/assessments/{a['id']}").status_code == 404
    assert all(z["state"] == "not_checked" for z in api.get("/api/v1/map").json()["zones"])


def test_questions_only_check_works_over_ai_limits(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "AI_RATE_LIMIT_PER_MINUTE", 0)
    a = start_check(api, answers={"crown": {"tender": "yes", "bumps": "yes"}})
    r = api.post(f"/api/v1/assessments/{a['id']}/run")
    assert r.status_code == 200
    z = next(z for z in r.json()["zones"] if z["zone"] == "crown")
    assert z["rules_state"]["state"] == "get_checked" and z["explanation"]["source"] == "template"


def test_rejects_huge_images(app):
    api = make_user(app, consents=("health_data", "analysis"))
    a = start_check(api, zones=("crown",))
    buf = io.BytesIO()
    Image.new("RGB", (7000, 7000), (80, 60, 40)).save(buf, format="PNG")
    r = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "crown"}, files={"file": ("big.png", buf.getvalue(), "image/png")})
    assert r.status_code == 422 and "too large" in r.json()["detail"]


def test_kept_photos_and_withdrawal(app):
    api = make_user(app, consents=("health_data", "analysis", "photo_retention"))
    a = start_check(api, zones=("crown",))
    pid = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "crown"},
                   files={"file": ("p.png", _png(), "image/png")}).json()["photo_id"]
    api.post(f"/api/v1/assessments/{a['id']}/run")
    assert api.get(f"/api/v1/photos/{pid}").status_code == 200
    j = api.get("/api/v1/journey").json()
    assert j["assessments"][0]["photos"][0]["id"] == pid
    r = api.put("/api/v1/consents/photo_retention", json={"granted": False}).json()
    assert r["photos_deleted"] == 1
    assert api.get(f"/api/v1/photos/{pid}").status_code == 404


def test_rejects_non_images_and_wrong_zone(app):
    api = make_user(app, consents=("health_data", "analysis"))
    a = start_check(api, zones=("crown",))
    r = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "crown"},
                 files={"file": ("x.txt", b"not an image", "text/plain")})
    assert r.status_code == 422
    r = api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "nape"},
                 files={"file": ("p.png", _png(), "image/png")})
    assert r.status_code == 422


def test_compare(app):
    api = make_user(app, consents=("health_data", "analysis", "photo_retention"))
    ids = []
    for _ in range(2):
        a = start_check(api, zones=("nape",))
        api.post(f"/api/v1/assessments/{a['id']}/photos", data={"zone": "nape"}, files={"file": ("p.png", _png(), "image/png")})
        api.post(f"/api/v1/assessments/{a['id']}/run")
        ids.append(a["id"])
    r = api.get(f"/api/v1/journey/compare?zone=nape&from={ids[0]}&to={ids[1]}").json()
    assert r["from"]["photo_id"] and r["to"]["photo_id"] and "light" in r["limits"]


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), (90, 60, 40)).save(buf, format="PNG")
    return buf.getvalue()
