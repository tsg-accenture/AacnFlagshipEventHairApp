"""List the most recent AI calls recorded in the ai_calls table (no content is ever stored there).

Run from backend/:  uv run python -m app.jobs.ai_calls        (last 25)
                    uv run python -m app.jobs.ai_calls 100    (last 100)

"fake" in the model column means Demo AI answered, not OpenAI.
"""
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import session_factory
from app.models import AICall


def main(limit: int = 25) -> int:
    s = get_settings()
    print(f"AI in use now: {'Demo AI' if s.uses_demo_ai else 'OpenAI'} (AI_MODE={s.AI_MODE}, "
          f"OPENAI_API_KEY {'set' if s.OPENAI_API_KEY else 'blank'})\n")
    db = session_factory()()
    try:
        rows = db.scalars(select(AICall).order_by(AICall.created_at.desc()).limit(limit)).all()
    finally:
        db.close()
    if not rows:
        print("No AI calls recorded yet.")
        return 0
    print(f"{'when (UTC)':19}  {'endpoint':11}  {'model':24}  {'feature':22}  {'status':18}  {'ms':>6}  tokens in/out")
    for r in rows:
        print(f"{r.created_at:%Y-%m-%d %H:%M:%S}  {r.endpoint:11}  {r.model[:24]:24}  {r.feature[:22]:22}  {r.status[:18]:18}  "
              f"{r.latency_ms:6.0f}  {r.input_tokens if r.input_tokens is not None else '-'}/{r.output_tokens if r.output_tokens is not None else '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 25))
