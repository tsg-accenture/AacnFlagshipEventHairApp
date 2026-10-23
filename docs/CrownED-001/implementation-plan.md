# CrownED-001 implementation plan

Status: planned, not implemented or validated.
Source of truth: [specification](./spec.md).
Execution checklist and requirements traceability: [tasks](./tasks.md).

## 1. Approach and boundaries

Implement a small, opt-in server-authored fixture alongside the existing guarded
Coach answer. Do not introduce catalogue infrastructure, model-generated
products, a migration, new dependencies or unrelated refactoring.
The backend owns eligibility and payload suppression; the frontend additionally
gates cached responses with the current capability. Keep source attribution,
clinical-review status, moderation and diagnosis guards intact.

Before editing, inspect the current branch/worktree and applicable repository
instructions, including the Next.js guidance linked by the frontend instructions.
Preserve unrelated untracked or modified files. Do not commit or push unless asked.

## 2. Work packages, order and dependencies

### P1. Establish fixture, types and switch (R1, R3, R4)

Dependencies: none.

1. Add `DEMO_PRODUCTS_ENABLED: bool = False` to
   [settings](../../backend/app/core/config.py). Provide one effective capability
   calculation that also requires `APP_ENV != "production"`.
2. Add a documented false default to [environment example](../../backend/.env.example).
   Do not edit or commit the operator's actual environment file.
3. Add a small typed fixture/helper module, proposed
   `backend/app/services/demo_products.py`, containing R1's three exact entries,
   disclaimer, payload schema and conservative source-ID eligibility rule.
   One module is sufficient; no repository abstraction or product database.
4. Expose effective `demo_products_enabled` through
   [health](../../backend/app/main.py). Update `Health` in
   [frontend types](../../frontend/lib/types.ts).
5. Add optional typed `demo_products` to `CoachReply`. Model `ownership_badge`
   as the literal `black owned` or null and require literal demo markers.
6. Keep fixture data out of library ingestion, embeddings, retrieval, citations
   and runtime AI generation. Return fresh serialized payloads to avoid mutation.

Deliverable: fixed contract and independently switchable non-production capability.

### P2. Integrate guarded answer and history (R3-R5, R7-R8)

Dependencies: P1.

1. Inspect [Coach pipeline](../../backend/app/ai/coach.py) and
   [prompt](../../backend/app/prompts/coach_v1.md) before changes.
2. Derive potential availability from retrieved article metadata for trusted
   prompt context. Keep product data separate from passage evidence.
3. Explain in the prompt that the answer remains source-grounded, cannot invent
   actual brands/ownership, and may distinguish conditional fictional demo
   examples when available. Preserve honest unsupported-product handling when off.
   Do not instruct the model to promise an unconditional shelf.
4. After citation and wording validation, derive cited article IDs and attach
   the fixture only if final eligibility is satisfied. Leave all early safety,
   no-answer and exception paths product-free. An ordinary signpost can coexist
   with products; an urgent/support result cannot.
5. Ensure Amara's guarded answer includes useful tension-reduction guidance,
   practical action and when-to-seek-help text/links. Verify both real AI and
   deterministic demonstration behaviour; do not infer correctness from links alone.
6. In [Coach API](../../backend/app/api/v1/coach.py), retain the payload in saved
   JSON and centralize output gating for both new answers and history.
   Copy on serialization; never delete fixture history from storage during reads.
7. Re-evaluate the effective feature switch and answer kind when serializing
   stored messages. No legacy backfill. No schema migration.
8. Test the edge where potential availability and validated cited topics differ:
   there must be no promised-but-missing shelf and no guard bypass.

Deliverable: stable API payload, safe persistence and non-contradictory wording.

### P3. Build coherent recommendation and product UI (R2, R6-R8)

Dependencies: P1 and P2.

1. Update shared `Reply` in [Ask](../../frontend/app/(app)/ask/page.tsx), not
   separate latest/history variants.
2. For `kind="answer"`, add `Recommendations` and the exact general-information
   explanation. Label the existing action `Next steps`.
3. Clearly label professional guidance `When to seek professional support` for
   signposted answers. Preserve relevant guidance in text and existing GP/specialist
   links; do not hardcode a clinical interpretation in the browser.
4. Keep [source rendering](../../frontend/components/Sources.tsx), draft badges
   and model provenance above the product shelf. Clarify that library/model
   attribution applies to recommendations rather than the fixture.
5. Render the product section last with the exact heading/disclaimer, three
   semantic cards, all three `Demo product` labels and the first two ownership
   badges. Reuse existing primitives/icons. Use no external images or shop actions.
   Extract a small component only if it makes `Reply` clearer.
6. Gate the shelf on current effective capability, successful answer kind and a
   complete valid optional payload. Old messages without products render normally.
7. In [health query handling](../../frontend/lib/hooks.ts) or a narrowly scoped
   Ask-page query configuration, refetch capability on mount/revisit and ensure
   history is refreshed. Do not rely on the existing five-minute health freshness.
   A loading/failed capability cannot authorize products. Surface request failures
   using existing error UI rather than silently pretending the feature is ready.
8. Confirm off-state suppression also hides a cached `latest` payload. Avoid adding
   polling; documented operator disable takes effect after backend restart and
   page reload/revisit, not instantaneously in an inactive tab.

Deliverable: one accessible response flow with truthful copy and durable display.

### P4. Extend focused automated coverage (R1-R9)

Dependencies: P2 for API tests; P3 for browser tests.

Backend:
- Extend [Coach tests](../../backend/tests/test_coach.py); add capability tests in
  the existing suitable AI-mode/config test file if needed.
- Assert exact fixture values, count, order, markers and null third badge.
- Assert eligible final citations, no products on wellbeing content or safety/
  no-answer/error paths, and no products when disabled.
- Cover saved payload fidelity, history stripping after switch-off, non-answer
  stored payload suppression and legacy JSON compatibility.
- Cover normal signpost eligibility, mode independence and production effective-off.
- Preserve/increase citation and diagnosis rejection coverage.
- Use fake parse hooks to produce a deterministic source-grounded Amara answer
  with signposting, rather than relying on FakeAI's existing first-line reply.
  Inspect current fake behaviour before deciding whether a narrowly scoped runtime
  fake improvement is required for the actual demo; never change all fake answers
  to a canned Amara narrative.

Frontend/browser:
- Extend [flow tests](../../frontend/e2e/flows.spec.ts), reusing registration,
  accessibility, overflow and console-error helpers.
- Add a focused test named with `trusted recommendations` so it can be selected.
- Verify exact headings, care sources, practical action and professional guidance.
- Assert per-answer card/badge counts, stable order, disclaimer and content order.
- Verify reload/revisit, duplicate submissions without duplicate per-answer shelves,
  legacy messages, disabled current capability with cached payload and safety exits.
- Test all configured projects: phone 390x844, tablet 768x1024, laptop 1440x900.
- Cover light, dark, high contrast, larger text and easier-reading font.
- Use controlled browser responses for off/legacy/cache branches where useful,
  explicitly distinguish those from the unmocked fake-AI integration test.
  Actual server disable/history stripping must also be verified by API tests.
- Make E2E setup explicitly require products enabled, fake AI and seeded draft
  library in the isolated demonstration backend. Do not depend on a developer's
  live OpenAI account or silently toggle a shared server.

Deliverable: focused regression coverage and deterministic evidence for the contract.

### P5. Verify, document and hand off (R10, AC1-AC10)

Dependencies: P4.

1. Run from `backend/`:

   ```sh
   uv run pytest tests/test_coach.py tests/test_ai_mode.py -q
   ```

   Add another touched existing test file to this single command if its coverage
   changed. Escalate to broader suites only when focused failures indicate a need.

2. Run from `frontend/`:

   ```sh
   npm run check
   npm run test:e2e -- --grep "trusted recommendations"
   ```

   Existing Playwright config runs three responsive projects. Use isolated backend
   configuration with `AI_MODE=fake`, `LIBRARY_INCLUDE_DRAFTS=true` and
   `DEMO_PRODUCTS_ENABLED=true`. No new runner or dependency is required.

3. Manually run the canonical prompt and a natural paraphrase in the running app.
   Confirm recommendation quality, professional guidance and no contradictory
   product refusal. If real AI is configured, verify that path with an operator's
   authorized demo setup; automated fake tests cannot prove real-model wording.
4. Validate switch-off by changing only the authorized demo configuration,
   restarting the backend, then reloading/revisiting Ask. Confirm API history
   omits products, cached UI is hidden and stored old messages remain intact.
   Restore the agreed demo setting after verification. Never restart unrelated
   shared services or alter secrets without permission.
5. Update [README](../../README.md): demo shelf versus future real catalogue,
   exact flag defaults/production exclusion, startup/reload steps, fictional
   ownership disclaimer, canonical prompt, supported AI modes and limitations.
6. Complete the checklist with actual evidence. Do not mark tests passed without
   running them. Report any blocked manual checks, service failures or unrelated
   baseline failures separately.
7. Inspect final diff for scope and accidental secrets. No clinical-review sign-off
   or Journey 2 work is required for this demo. No unrequested commit/push.

## 3. Main risks and controls

| Risk | Control and proof |
|---|---|
| Fictional ownership mistaken for fact | Exact section disclaimer, per-card demo labels, no real brands; browser assertions |
| Products beside urgent/support output | Final guarded-kind gate plus source eligibility; negative API/browser tests |
| Prompt promises shelf but citations make answer ineligible | Conditional trusted context and final validation test |
| Saved shelf stays visible after disable | API serialization suppression plus refreshed capability gating for cached UI |
| Library citations appear to endorse mock products | Separate payload/section and scoped provenance above shelf |
| Fake tests pass but runtime narrative lacks signposting | Deterministic source-grounded fixture and explicit manual runtime check |
| Broader scope or accidental production exposure | False default, production effective-off, no catalogue/checkout/migration |

## 4. Completion rule

All requirements and all ten acceptance gates in the specification must have
implementation and verification evidence in [tasks](./tasks.md).
Documentation alignment is verified separately from application completion.
Do not claim 10/10 readiness until the runtime journey has actually been verified.
