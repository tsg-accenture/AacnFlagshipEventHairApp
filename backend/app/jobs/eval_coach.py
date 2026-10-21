"""Run the Hair Coach question set (evals/coach_questions.yaml) against the current library and AI mode.

Run from backend/:  uv run python -m app.jobs.eval_coach
With OpenAI in use this calls the API (it costs a little). With Demo AI it checks the plumbing only.
"""
import sys

import yaml

from app.ai.coach import ask
from app.ai.guard import banned_phrase
from app.ai.openai_client import AIUnavailable, get_ai
from app.core.config import REPO_DIR, get_settings
from app.core.db import session_factory
from app.models import LibraryChunk


def main() -> int:
    cases = yaml.safe_load((REPO_DIR / "evals" / "coach_questions.yaml").read_text(encoding="utf-8"))["questions"]
    db = session_factory()()
    try:
        ai = get_ai(db, None)
    except AIUnavailable as e:
        print(e)
        return 1
    print(f"AI: {'Demo AI' if get_settings().uses_demo_ai else 'OpenAI'}. Library drafts citable: {get_settings().LIBRARY_INCLUDE_DRAFTS}\n")
    failures = 0
    for c in cases:
        r = ask(db, ai, c["q"])
        want = c["expect_kind"] if isinstance(c["expect_kind"], list) else [c["expect_kind"]]
        problems = []
        if r["kind"] not in want:
            problems.append(f"kind {r['kind']} (wanted {'/'.join(want)})")
        if r["kind"] == "answer" and c.get("expect_articles"):
            cited = {db.get(LibraryChunk, cid).article_id for cid in r.get("cited", [])}
            if not cited & set(c["expect_articles"]):
                problems.append(f"cited {sorted(cited) or 'nothing'}, wanted one of {c['expect_articles']}")
        if (bad := banned_phrase(" ".join([r.get("text", ""), r.get("action", "") or ""]))):
            problems.append(f"diagnostic wording: '{bad}'")
        failures += bool(problems)
        print(("PASS " if not problems else "FAIL ") + c["q"])
        for p in problems:
            print("     " + p)
    db.close()
    print(f"\n{len(cases) - failures}/{len(cases)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
