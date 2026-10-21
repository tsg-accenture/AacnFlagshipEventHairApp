from datetime import date, timedelta

from tests.conftest import make_user


def test_checkin_needs_health_consent(app):
    api = make_user(app, consents=())
    r = api.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "none"}})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "consent_required"


def test_onboarding_profile_and_today(api):
    r = api.put("/api/v1/profile", json={"display_name": "Ama", "data": {"route": "routine", "style_kind": "braids",
                                                                         "wash_day": "fri", "goals": ["edges"]},
                                         "complete_onboarding": True})
    assert r.status_code == 200 and r.json()["onboarding_completed_at"]
    install = date.today() - timedelta(days=2)
    p = api.post("/api/v1/rhythm/periods", json={"style_name": "Knotless braids", "style_kind": "braids",
                                                  "install_date": install.isoformat(),
                                                  "take_down_planned": (install + timedelta(days=42)).isoformat()})
    assert p.status_code == 201 and p.json()["day"] == 3
    today = api.get("/api/v1/rhythm/today").json()
    types = [c["type"] for c in today["cards"]]
    assert "checkin" in types and "wash_day" in types
    ci = next(c for c in today["cards"] if c["type"] == "checkin")
    assert ci["template"] == "day-3"
    # after the day-3 check-in, it no longer shows
    r = api.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "a_little", "bumps": "none"}})
    assert r.status_code == 201
    body = r.json()
    assert body["outcome"] == "ease_the_pull" and body["article"]["article_id"] == "tight-styles-and-your-edges"
    types = [c["type"] for c in api.get("/api/v1/rhythm/today").json()["cards"]]
    assert "checkin" not in types


def test_unknown_profile_field_and_bad_answers(api):
    assert api.put("/api/v1/profile", json={"data": {"favourite_colour": "gold"}}).status_code == 422
    assert api.post("/api/v1/checkins", json={"template": "day-3", "answers": {"tightness": "very"}}).status_code == 422
    assert api.post("/api/v1/checkins", json={"template": "nope", "answers": {"tightness": "none"}}).status_code == 404


def test_rhythm_moves_forward_only(api):
    p = api.post("/api/v1/rhythm/periods", json={"style_name": "Twists", "style_kind": "twists",
                                                  "install_date": date.today().isoformat()}).json()
    assert p["stage"] == "install"
    r = api.patch(f"/api/v1/rhythm/periods/{p['id']}", json={"stage": "take_down"})
    assert r.json()["stage"] == "take_down" and r.json()["take_down_date"] == date.today().isoformat()
    assert api.patch(f"/api/v1/rhythm/periods/{p['id']}", json={"stage": "wear"}).status_code == 422
    assert api.post("/api/v1/rhythm/periods", json={"style_name": "X", "style_kind": "wig",
                                                     "install_date": (date.today() + timedelta(days=2)).isoformat()}).status_code == 422


def test_pattern_escalation_and_not_now(api):
    for _ in range(2):
        r = api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "hurts"}})
        assert r.json()["outcome"] == "too_tight"
    assert r.json()["escalate"] is True
    cards = api.get("/api/v1/rhythm/today").json()["cards"]
    assert [c["type"] for c in cards][:2] == ["onboarding", "get_checked"]
    ref = api.get("/api/v1/referrals").json()
    assert ref["reasons"][0]["rule_id"] == "PAT-SORE-REPEAT"
    assert any("nhs.uk" in l["url"] for l in ref["links"])
    assert api.post("/api/v1/referrals/not-now", json={"days": 14}).status_code == 200
    assert "get_checked" not in [c["type"] for c in api.get("/api/v1/rhythm/today").json()["cards"]]
    assert api.get("/api/v1/referrals").json()["snoozed_until"]


def test_checkin_note_crisis_gets_support_message(api):
    r = api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "none"},
                                            "note": "honestly I want to end my life"})
    assert r.status_code == 201
    body = r.json()
    assert body["saved"] is False and "116 123" in body["support"]["message"]


def test_plans_and_wash_day(api):
    api.put("/api/v1/profile", json={"data": {"wash_day": "sun", "treatments": ["heat", "relaxer"]}})
    api.post("/api/v1/rhythm/periods", json={"style_name": "Box braids", "style_kind": "braids",
                                              "install_date": date.today().isoformat()})
    plan = api.get("/api/v1/plans/current").json()
    ids = [i["id"] for s in plan["sections"] for i in s["items"]]
    assert {"heat-protect", "chemical-pro", "plan-take-down"} <= set(ids)
    assert "Sunday" in next(i["text"] for s in plan["sections"] for i in s["items"] if i["id"] == "wash-frequency")
    refreshed = api.post("/api/v1/plans/refresh").json()
    assert refreshed["intro_source"] == "ai" and refreshed["demo_ai"] is True
    wd = api.get("/api/v1/plans/wash-day").json()
    assert [s["id"] for s in wd["steps"]][0] == "set-up"


def test_goals_and_journey(api):
    g = api.post("/api/v1/goals", json={"title": "Healthy edges", "area": "edges"}).json()
    r = api.patch(f"/api/v1/goals/{g['id']}", json={"milestone": "Edges feel softer after 3 wash days"})
    assert r.json()["milestones"][0]["note"].startswith("Edges")
    assert len(api.get("/api/v1/goals").json()) == 1
    api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"edges": "fine"}})
    j = api.get("/api/v1/journey").json()
    assert len(j["checkins"]) == 1 and "not an AI judgement" in j["label"]
    assert api.delete(f"/api/v1/goals/{g['id']}").status_code == 200


def test_cannot_touch_someone_elses_goal(app):
    a = make_user(app, email="a@example.com")
    b = make_user(app, email="b@example.com")
    g = a.post("/api/v1/goals", json={"title": "More moisture", "area": "moisture"}).json()
    assert b.patch(f"/api/v1/goals/{g['id']}", json={"status": "paused"}).status_code == 404
    assert b.delete(f"/api/v1/goals/{g['id']}").status_code == 404


def test_goal_edit_is_screened_before_saving(api):
    g = api.post("/api/v1/goals", json={"title": "Healthy edges", "area": "edges"}).json()
    r = api.patch(f"/api/v1/goals/{g['id']}", json={"title": "I want to end my life", "status": "paused"}).json()
    assert r["saved"] is False and "116 123" in r["support"]["message"]
    after = api.get("/api/v1/goals").json()[0]
    assert after["title"] == "Healthy edges" and after["status"] == "active"


def test_plan_follows_the_latest_style_without_ai(api):
    assert not [i for s in api.get("/api/v1/plans/current").json()["sections"] if s["id"] == "for_you" for i in s["items"]]
    api.post("/api/v1/rhythm/periods", json={"style_name": "Box braids", "style_kind": "braids", "install_date": date.today().isoformat()})
    plan = api.get("/api/v1/plans/current").json()
    assert "plan-take-down" in [i["id"] for s in plan["sections"] for i in s["items"]]


def test_bad_inputs_are_422_not_500(api):
    assert api.get("/api/v1/checkins?limit=-1").status_code == 422
    assert api.get("/api/v1/coach/history?limit=0").status_code == 422
    assert api.put("/api/v1/profile", json={"data": {"treatments": [1, 2]}}).status_code == 422
    assert api.put("/api/v1/profile", json={"data": {"wash_day": "someday"}}).status_code == 422


def test_withdrawing_health_consent_stops_alerts(api):
    for _ in range(2):
        api.post("/api/v1/checkins", json={"template": "weekly", "answers": {"tightness": "hurts"}})
    assert api.get("/api/v1/referrals").json()["reasons"]
    api.put("/api/v1/consents/health_data", json={"granted": False})
    assert api.get("/api/v1/referrals").json()["reasons"] == []
    assert "get_checked" not in [c["type"] for c in api.get("/api/v1/rhythm/today").json()["cards"]]
    ids = [i["id"] for i in api.get("/api/v1/stylist-note/items").json()["items"]]
    assert "sore-history" not in ids
