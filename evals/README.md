# Evaluations

| What | Where | Status in v1-base |
|---|---|---|
| Hair Coach question set | `coach_questions.yaml`, run with `uv run python -m app.jobs.eval_coach` from `backend/` | Included. Re-run after any library, prompt or model change. |
| Photo observation set | `photos/` (never committed) | Not included. Needs consented, advisor-labelled photos across skin tones, hair types, styles and lighting. No photo observation should reach real users until it passes the bar your advisor sets (plan: Testing). |

The photo set needs explicit research consent from each person photographed. `photos/` is in `.gitignore`.
