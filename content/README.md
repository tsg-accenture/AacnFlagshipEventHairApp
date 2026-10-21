# Content

Everything here is **draft**, written by the build team from public sources so the app can be tried.
Your clinical advisor must review it before real users see it.

| File | What it holds | Who owns it |
|---|---|---|
| `library/*.md` | Hair Coach and report passages. Front matter holds sources, `status` (draft, reviewed, retired), reviewer and review date. | Advisor reviews; set `status: reviewed` only after review |
| `checkins.yaml` | Check-in questions and answer choices | Advisor |
| `plans.yaml` | Care-plan and wash-day templates | Advisor |
| `zones.yaml` | The five zones, zone questions, signs and capture tips | Advisor |
| `consents.yaml` | Data-receipt wording for each consent switch | Your DPO / privacy adviser |
| `onboarding.yaml` | Scripted onboarding chat | Product |
| `referrals.yaml`, `support.yaml` | Signposting links and the fixed crisis message | Advisor |

The rules that turn answers and photo observations into states live in
`backend/app/rules/rules_v1.yaml`.

After editing `library/`, re-run `uv run python -m app.jobs.ingest_library` from `backend/`.
Example images for each sign are deliberately missing: they must be licensed images on darker
skin, reviewed by the advisor, never AI-generated (see the plan's risks table).
