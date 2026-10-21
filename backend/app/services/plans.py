"""Care plans from advisor templates (content/plans.yaml). AI never adds items."""
from __future__ import annotations

from datetime import date

from app.content import load_yaml
from app.models import Profile, StylePeriod
from app.services.rhythm import PROTECTIVE, WEEKDAY_NAMES, WEEKDAYS


def _fill(text: str, values: dict) -> str:
    for k, v in values.items():
        text = text.replace("{" + k + "}", v)
    return text


def build_plan(profile: Profile | None, period: StylePeriod | None) -> dict:
    tpl = load_yaml("plans")["care_plan"]
    data = profile.data if profile else {}
    wash_day = data.get("wash_day")
    values = {
        "wash_day_phrase": f" (your wash day is {WEEKDAY_NAMES[WEEKDAYS.index(wash_day)]})" if wash_day in WEEKDAYS else "",
        "take_down_phrase": (
            f" (planned for {period.take_down_planned.day} {period.take_down_planned.strftime('%B')})" if period and period.take_down_planned else ""
        ),
    }

    def items(lst: list[dict]) -> list[dict]:
        return [{"id": i["id"], "text": _fill(i["text"], values), "article": i.get("article")} for i in lst]

    treatments = set(data.get("treatments") or [])
    conditional: list[dict] = []
    if period and period.style_kind in PROTECTIVE:
        conditional += items(tpl["when"]["protective_style"])
    if "heat" in treatments:
        conditional += items(tpl["when"]["uses_heat"])
    if treatments & {"relaxer", "colour"}:
        conditional += items(tpl["when"]["chemical"])
    return {
        "generated_on": date.today().isoformat(),
        "sections": [
            {"id": "daily", "title": "Every day", "items": items(tpl["daily"])},
            {"id": "weekly", "title": "Every week", "items": items(tpl["weekly"])},
            {"id": "monthly", "title": "Every month", "items": items(tpl["monthly"])},
            {"id": "for_you", "title": "For your style and treatments", "items": conditional},
            {"id": "seasonal", "title": "Seasonal", "items": items(tpl.get("seasonal") or []),
             "note": "Seasonal guidance is waiting for advisor content."},
        ],
        "goals": data.get("goals") or [],
    }


def wash_day_steps() -> list[dict]:
    return load_yaml("plans")["wash_day"]["steps"]
