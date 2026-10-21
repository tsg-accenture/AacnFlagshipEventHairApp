from datetime import date

from tests.conftest import make_user


def test_care_pack_needs_sharing_consent_and_is_a_pdf(app):
    api = make_user(app)
    api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "hurts"}, "note": "Sore at the front"})
    assert api.post("/api/v1/care-pack", json={}).status_code == 403
    api.put("/api/v1/consents/sharing", json={"granted": True})
    r = api.post("/api/v1/care-pack", json={"questions": ["What could be causing this?", "My own question"], "note": "Since August"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"


def test_stylist_note_only_ticked_items(app):
    api = make_user(app, consents=("health_data", "sharing"))
    api.post("/api/v1/rhythm/periods", json={"style_name": "Knotless", "style_kind": "braids", "install_date": date.today().isoformat()})
    api.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "hurts"}})
    items = api.get("/api/v1/stylist-note/items").json()["items"]
    ids = [i["id"] for i in items]
    assert {"loose-edges", "lighter-front", "sore-history", "no-extra-tension"} <= set(ids)
    r = api.post("/api/v1/stylist-note", json={"item_ids": ["loose-edges", "sore-history"], "polish": True}).json()
    assert r["polished"] is True
    assert "edges and temples" in r["text"] and "sore" in r["text"]
    assert "lighter" not in r["text"]  # not ticked, not included
    assert api.post("/api/v1/stylist-note", json={"item_ids": ["made-up"]}).status_code == 422


def test_polish_cannot_add_claims(app, monkeypatch):
    from app.ai.fake import FakeAI
    from app.ai.text_jobs import PolishedLine, PolishedNote

    api = make_user(app, consents=("health_data", "sharing"))

    def sneaky(self, *, feature, schema, fake=None, **kw):
        if schema is PolishedNote:
            return PolishedNote(lines=[PolishedLine(item_id="loose-edges",
                                                    sentence="My dermatologist diagnosed scarring so use a medicated relaxer weekly.")])
        return None

    monkeypatch.setattr(FakeAI, "parse", sneaky)
    r = api.post("/api/v1/stylist-note", json={"item_ids": ["loose-edges"], "polish": True}).json()
    assert r["polished"] is False
    assert "Please keep it loose around my edges and temples." in r["text"]
    assert "relaxer" not in r["text"]
