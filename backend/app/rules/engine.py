"""Versioned rules engine. Reads YAML the clinical advisor owns; never calls AI.

States: calm | watch | get_checked | not_checked. Check-in outcomes: all_good | ease_the_pull | too_tight.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

RULES_FILE = Path(__file__).with_name("rules_v1.yaml")
ZONES = ["hairline", "left_temple", "right_temple", "crown", "nape"]
STATES = ["calm", "watch", "get_checked", "not_checked"]
OUTCOMES = ["all_good", "ease_the_pull", "too_tight"]
SEVERITY = {"not_checked": 0, "calm": 1, "watch": 2, "get_checked": 3}
MISSING = "missing"


SIGN_FIELDS = ["short_broken_hairs", "looks_thinner", "flaking", "build_up", "bumps_or_spots"]
CHECKIN_FIELDS = {"tightness", "soreness", "bumps", "itch", "edges"}
ZONE_FIELDS = {f"obs.{f}" for f in SIGN_FIELDS} | {f"answer.{f}" for f in ("tender", "change", "itch", "bumps")}


class RulesError(ValueError):
    pass


def _check_condition(cond: Any, fields: set[str], rid: str) -> None:
    if cond == "always":
        return
    if not isinstance(cond, dict):
        raise RulesError(f"{rid}: a condition must be 'always' or a mapping, not {cond!r}")
    keys = set(cond)
    if keys in ({"all"}, {"any"}):
        items = cond["all"] if "all" in cond else cond["any"]
        if not isinstance(items, list) or not items:
            raise RulesError(f"{rid}: all/any needs a non-empty list")
        for c in items:
            _check_condition(c, fields, rid)
        return
    if keys in ({"field", "in"}, {"field", "not_in"}):
        if cond["field"] not in fields:
            raise RulesError(f"{rid}: unknown field {cond['field']!r}. Use one of: {', '.join(sorted(fields))}")
        values = cond.get("in", cond.get("not_in"))
        if not isinstance(values, list) or not values:
            raise RulesError(f"{rid}: '{'in' if 'in' in cond else 'not_in'}' needs a list of values")
        return
    raise RulesError(f"{rid}: unknown condition {cond!r}. Use field + in/not_in, all, any or 'always'")


def _get(facts: dict, dotted: str) -> Any:
    cur: Any = facts
    for part in dotted.split("."):
        if not isinstance(cur, dict) or cur.get(part) in (None, ""):
            return MISSING
        cur = cur[part]
    return cur


def matches(cond: Any, facts: dict) -> bool:
    if cond == "always":
        return True
    if not isinstance(cond, dict):
        raise RulesError(f"Bad condition: {cond!r}")
    if "all" in cond:
        return all(matches(c, facts) for c in cond["all"])
    if "any" in cond:
        return any(matches(c, facts) for c in cond["any"])
    if "field" in cond:
        value = _get(facts, cond["field"])
        if "in" in cond:
            return value in cond["in"]
        if "not_in" in cond:
            return value not in cond["not_in"]
        raise RulesError(f"Condition on {cond['field']} needs 'in' or 'not_in'")
    raise RulesError(f"Bad condition: {cond!r}")


@dataclass
class CheckinResult:
    outcome: str
    rule_ids: list[str]
    escalate: bool
    message: dict
    rules_version: str


@dataclass
class PatternHit:
    rule_id: str
    result: str
    reason: str
    count: int


@dataclass
class ZoneResult:
    zone: str
    state: str
    rule_ids: list[str]
    reasons: list[str]
    topics: list[str] = field(default_factory=list)


class Rules:
    def __init__(self, data: dict):
        self.data = data
        self.validate()

    @classmethod
    def from_yaml(cls, text: str) -> "Rules":
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as e:
            raise RulesError(f"YAML error: {e}") from e
        if not isinstance(data, dict):
            raise RulesError("Rules file must be a mapping")
        return cls(data)

    @property
    def version(self) -> str:
        return str(self.data["version"])

    @property
    def status(self) -> str:
        return str(self.data.get("status", "draft"))

    def validate(self) -> None:
        """Rejects anything that could fail later at runtime: unknown fields or operators, missing
        wording, bad reasons, or a list without a final 'always' rule. Then dry-runs every section."""
        d = self.data
        for key in ("version", "checkin", "patterns", "zones"):
            if key not in d:
                raise RulesError(f"Missing top-level key: {key}")
        ids: set[str] = set()

        def rule_id(r: dict, where: str) -> str:
            if not isinstance(r, dict) or not r.get("id"):
                raise RulesError(f"Every rule in {where} needs an id")
            if r["id"] in ids:
                raise RulesError(f"Duplicate rule id {r['id']}")
            ids.add(r["id"])
            return r["id"]

        def text(r: dict, key: str, rid: str) -> None:
            if not isinstance(r.get(key), str) or not r[key].strip():
                raise RulesError(f"{rid}: '{key}' must be some text")

        outcomes = d["checkin"].get("outcomes")
        if not outcomes:
            raise RulesError("checkin.outcomes is empty")
        for r in outcomes:
            rid = rule_id(r, "checkin.outcomes")
            if r.get("outcome") not in OUTCOMES:
                raise RulesError(f"{rid}: unknown outcome {r.get('outcome')}")
            _check_condition(r.get("when"), CHECKIN_FIELDS, rid)
        if outcomes[-1]["when"] != "always":
            raise RulesError("The last check-in rule must be 'when: always' so every check-in gets an outcome")
        for o in OUTCOMES:
            msg = d["checkin"].get("messages", {}).get(o)
            if not isinstance(msg, dict):
                raise RulesError(f"Missing check-in message for {o}")
            for k in ("title", "body", "action"):
                text(msg, k, f"message {o}")

        for p in d["patterns"]:
            rid = rule_id(p, "patterns")
            if p.get("result") not in ("watch", "get_checked"):
                raise RulesError(f"{rid}: result must be watch or get_checked")
            for k in ("window_days", "min_count"):
                if not isinstance(p.get(k), int) or p[k] < 1:
                    raise RulesError(f"{rid}: {k} must be a whole number of 1 or more")
            _check_condition(p.get("match"), CHECKIN_FIELDS, rid)
            text(p, "reason", rid)
            try:
                p["reason"].format(count=1)
            except (KeyError, IndexError, ValueError) as e:
                raise RulesError(f"{rid}: reason can only use {{count}} ({e})") from e

        zones = d["zones"]
        for section in ("red_flags", "rules"):
            for r in zones.get(section) or []:
                rid = rule_id(r, f"zones.{section}")
                if r.get("state") not in STATES:
                    raise RulesError(f"{rid}: unknown state {r.get('state')}")
                _check_condition(r.get("when"), ZONE_FIELDS, rid)
                text(r, "reason", rid)
        if not zones.get("rules") or zones["rules"][-1]["when"] != "always":
            raise RulesError("The last zone rule must be 'when: always'")
        for state, topics in (zones.get("topics") or {}).items():
            if state not in STATES or not isinstance(topics, list) or not all(isinstance(t, str) for t in topics):
                raise RulesError(f"zones.topics.{state} must be a list of article ids under a known state")

        # Dry run on sample answers: every section must produce a result without errors.
        samples = [{}, {f: "hurts" for f in CHECKIN_FIELDS}, {"tightness": "none", "bumps": "lots", "edges": "thinner"}]
        for a in samples:
            self.evaluate_checkin(a)
        now = datetime.now(timezone.utc)
        self.evaluate_patterns([dict(a, created_at=now) for a in samples], now)
        for obs in (None, {k: "visible" for k in SIGN_FIELDS}, {k: "cant_tell" for k in SIGN_FIELDS}):
            for ans in (None, {"tender": "yes", "change": "yes", "itch": "yes", "bumps": "yes"}):
                self.evaluate_zone("hairline", obs, ans)

    # ----- check-ins -----
    def evaluate_checkin(self, answers: dict) -> CheckinResult:
        for r in self.data["checkin"]["outcomes"]:
            if matches(r["when"], answers):
                msg = dict(self.data["checkin"]["messages"][r["outcome"]])
                return CheckinResult(r["outcome"], [r["id"]], bool(r.get("escalate")), msg, self.version)
        raise RulesError("No check-in rule matched")  # unreachable: last rule is 'always'

    def evaluate_patterns(self, history: list[dict], now: datetime | None = None) -> list[PatternHit]:
        """history: check-in dicts with created_at (aware datetime) and answer fields."""
        now = now or datetime.now(timezone.utc)
        hits = []
        for p in self.data["patterns"]:
            since = now - timedelta(days=int(p["window_days"]))
            n = sum(1 for h in history if h["created_at"] >= since and matches(p["match"], h))
            if n >= int(p["min_count"]):
                hits.append(PatternHit(p["id"], p["result"], p["reason"].format(count=n), n))
        return hits

    # ----- zones -----
    def evaluate_zone(self, zone: str, observations: dict | None, answers: dict | None) -> ZoneResult:
        facts = {"obs": observations or {}, "answer": answers or {}}
        topics = self.data["zones"].get("topics", {})
        for r in self.data["zones"]["red_flags"]:
            if matches(r["when"], facts):
                return ZoneResult(zone, r["state"], [r["id"]], [r["reason"]], topics.get(r["state"], []))
        for r in self.data["zones"]["rules"]:
            if matches(r["when"], facts):
                return ZoneResult(zone, r["state"], [r["id"]], [r["reason"]], topics.get(r["state"], []))
        raise RulesError("No zone rule matched")


_file_cache: Rules | None = None


def file_rules() -> Rules:
    global _file_cache
    if _file_cache is None:
        _file_cache = Rules.from_yaml(RULES_FILE.read_text(encoding="utf-8"))
    return _file_cache


def active_rules(db: Session) -> Rules:
    """The newest rules uploaded through /admin/rules, else the YAML file in the repo."""
    from app.models import RulesVersion

    row = db.scalars(select(RulesVersion).order_by(RulesVersion.created_at.desc()).limit(1)).first()
    if row is not None:
        return Rules.from_yaml(row.yaml_text)
    return file_rules()
