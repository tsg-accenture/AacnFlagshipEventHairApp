"""Table-driven rules tests. When the advisor replaces rules_v1.yaml, update these cases from their sheet."""
from datetime import datetime, timedelta, timezone

import pytest

from app.rules.engine import Rules, RulesError, file_rules

R = file_rules()


@pytest.mark.parametrize(
    "answers, outcome, rule",
    [
        ({"tightness": "none", "bumps": "none", "itch": "none"}, "all_good", "CI-OK-1"),
        ({"tightness": "a_little"}, "ease_the_pull", "CI-EASE-1"),
        ({"bumps": "a_few"}, "ease_the_pull", "CI-EASE-1"),
        ({"edges": "thinner"}, "ease_the_pull", "CI-EASE-1"),
        ({"tightness": "hurts"}, "too_tight", "CI-TIGHT-1"),
        ({"soreness": "hurts"}, "too_tight", "CI-TIGHT-1"),
        ({"tightness": "hurts", "bumps": "lots"}, "too_tight", "CI-RED-1"),
        ({"itch": "a_lot"}, "all_good", "CI-OK-1"),
    ],
)
def test_checkin_outcomes(answers, outcome, rule):
    res = R.evaluate_checkin(answers)
    assert res.outcome == outcome
    assert res.rule_ids == [rule]
    assert res.message["title"]


def test_red_flag_checkin_escalates():
    assert R.evaluate_checkin({"tightness": "hurts", "bumps": "lots"}).escalate is True
    assert R.evaluate_checkin({"tightness": "hurts"}).escalate is False


@pytest.mark.parametrize(
    "obs, answers, state, rule",
    [
        (None, None, "not_checked", "Z-NC-1"),
        ({"short_broken_hairs": "cant_tell", "looks_thinner": "cant_tell", "flaking": "cant_tell", "build_up": "cant_tell",
          "bumps_or_spots": "cant_tell"}, {}, "not_checked", "Z-NC-1"),
        (None, {"tender": "no", "change": "no"}, "calm", "Z-C-1"),
        ({"short_broken_hairs": "not_visible", "looks_thinner": "not_visible", "flaking": "not_visible",
          "build_up": "visible", "bumps_or_spots": "not_visible"}, {}, "calm", "Z-C-1"),
        ({"looks_thinner": "visible"}, {"change": "no"}, "watch", "Z-W-1"),
        ({"short_broken_hairs": "visible"}, {}, "watch", "Z-W-1"),
        (None, {"tender": "a_little"}, "watch", "Z-W-1"),
        ({"flaking": "visible"}, {"itch": "yes", "change": "no", "tender": "no"}, "watch", "Z-W-2"),
        ({"looks_thinner": "visible"}, {"change": "yes"}, "get_checked", "Z-GC-1"),
        (None, {"tender": "yes", "bumps": "yes"}, "get_checked", "Z-RED-1"),
    ],
)
def test_zone_states(obs, answers, state, rule):
    res = R.evaluate_zone("hairline", obs, answers)
    assert (res.state, res.rule_ids) == (state, [rule])


def test_patterns():
    now = datetime.now(timezone.utc)
    sore = {"tightness": "hurts", "soreness": None, "bumps": None, "itch": None, "edges": None}
    hist = [dict(sore, created_at=now - timedelta(days=3)), dict(sore, created_at=now - timedelta(days=10))]
    hits = R.evaluate_patterns(hist, now)
    assert [h.rule_id for h in hits] == ["PAT-SORE-REPEAT"]
    assert "2 check-ins" in hits[0].reason
    old = [dict(sore, created_at=now - timedelta(days=40)), dict(sore, created_at=now - timedelta(days=50))]
    assert R.evaluate_patterns(old, now) == []


def test_rules_validation_rejects_bad_files():
    text = (R.data and __import__("yaml").safe_dump(R.data))
    Rules.from_yaml(text)  # round-trips
    bad = dict(R.data)
    bad["checkin"] = dict(R.data["checkin"], outcomes=R.data["checkin"]["outcomes"][:-1])
    with pytest.raises(RulesError, match="when: always"):
        Rules(bad)
    with pytest.raises(RulesError):
        Rules.from_yaml("version: x\n")
    worse = __import__("copy").deepcopy(R.data)
    worse["zones"]["rules"][0]["state"] = "diagnosed"
    with pytest.raises(RulesError, match="unknown state"):
        Rules(worse)


def _broken(mutate):
    import copy

    data = copy.deepcopy(R.data)
    mutate(data)
    return data


def test_rules_validation_catches_runtime_failures():
    cases = [
        (lambda d: d["zones"]["rules"][1].update(when={"field": "answer.tender", "is": ["yes"]}), "unknown condition"),
        (lambda d: d["zones"]["red_flags"][0].update(when={"field": "answer.tendr", "in": ["yes"]}), "unknown field"),
        (lambda d: d["checkin"]["messages"]["too_tight"].pop("action"), "action"),
        (lambda d: d["patterns"][0].update(reason="You said {cnt} times"), "count"),
        (lambda d: d["patterns"][0].update(match={"field": "obs.flaking", "in": ["visible"]}), "unknown field"),
        (lambda d: d["patterns"][0].update(min_count=0), "min_count"),
    ]
    for mutate, msg in cases:
        with pytest.raises(RulesError, match=msg):
            Rules(_broken(mutate))
