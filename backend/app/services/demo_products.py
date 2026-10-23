"""Fixed, fictional product cards for the non-clinical demonstration."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal, TypedDict


class DemoProduct(TypedDict):
    id: str
    name: str
    brand: str
    description: str
    is_demo: Literal[True]
    ownership_badge: Literal["black owned"] | None


class DemoProducts(TypedDict):
    version: Literal["v1"]
    is_demo: Literal[True]
    disclaimer: str
    items: list[DemoProduct]


DISCLAIMER = (
    "Fictional products and ownership labels for demonstration only. "
    "These are not real brands or treatments for hair loss."
)

RELEVANT_ARTICLES = frozenset({
    "tight-styles-and-your-edges",
    "signs-a-style-is-too-tight",
    "early-changes",
})
WELLBEING_ARTICLE = "hair-loss-and-how-you-feel"

_FIXTURE: DemoProducts = {
    "version": "v1",
    "is_demo": True,
    "disclaimer": DISCLAIMER,
    "items": [
        {
            "id": "demo-gentle-cleanse",
            "name": "Gentle Cleanse Shampoo",
            "brand": "Demo Crown Care A",
            "description": "Fictional example of a shampoo for routine cleansing.",
            "is_demo": True,
            "ownership_badge": "black owned",
        },
        {
            "id": "demo-soft-touch",
            "name": "Soft Touch Conditioner",
            "brand": "Demo Crown Care B",
            "description": "Fictional example of a rinse-out conditioner for a regular wash routine.",
            "is_demo": True,
            "ownership_badge": "black owned",
        },
        {
            "id": "demo-lightweight-moisture",
            "name": "Lightweight Moisture Spray",
            "brand": "Demo Crown Care C",
            "description": "Fictional example of a lightweight spray for a general moisture routine.",
            "is_demo": True,
            "ownership_badge": None,
        },
    ],
}


def demo_products_payload() -> DemoProducts:
    """Return an independent payload so callers cannot mutate the fixture."""
    return deepcopy(_FIXTURE)


def eligible_for_demo_products(*, kind: str, cited_article_ids: set[str], enabled: bool) -> bool:
    return (
        enabled
        and kind == "answer"
        and bool(cited_article_ids & RELEVANT_ARTICLES)
        and WELLBEING_ARTICLE not in cited_article_ids
    )


def serialize_coach_answer(answer: dict[str, Any], *, kind: str, enabled: bool) -> dict[str, Any]:
    """Gate a copied answer for both new replies and saved history."""
    result = dict(answer)
    if not enabled or kind != "answer":
        result.pop("demo_products", None)
    return result
