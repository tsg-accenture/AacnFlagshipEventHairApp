# CrownED-001 implementation agent checklist

Status: implementation and focused automated checks are complete; live-runtime and
several broader acceptance checks remain outstanding.
Branch: `CrownED-001/trusted-advice`.
Read [specification](./spec.md) first, then [implementation plan](./implementation-plan.md).
Checked execution boxes below reflect work completed and evidence obtained as of
2026-10-23. Browser response fixtures were mocked for the focused E2E checks;
they do not establish live OpenAI wording or a configured demo-server journey.

## 1. Alignment audit against the requested ten steps

Each row maps the user's step to an explicit specification requirement, executable
work package and verification task. No requested feature has been dropped.

| User step | Spec | Plan | Checklist evidence |
|---|---|---|---|
| 1. Fixed fictional examples, labels, disclaimer, no claims/shopping | R1 | P1, P3, P4 | T1, T4, T5, T6 |
| 2. Recommendations, non-clinical framing, preserved disclosures | R2 | P3, P4 | T4, T6 |
| 3. Explicit switch, mode independence, relevant/safe-only answers | R3 | P1, P2, P4 | T1, T2, T5 |
| 4. Structured payload, assembly/API/types/history, legacy support | R4 | P1, P2, P3 | T1, T2, T3, T5 |
| 5. Resolve refusal without weakening grounding or guards | R5 | P2, P4, P5 | T2, T5, T7 |
| 6. Last-position responsive accessible product display | R6 | P3, P4 | T4, T6 |
| 7. Practical next steps and professional guidance remain prominent | R7 | P2, P3, P4 | T2, T4, T5, T6, T7 |
| 8. Refresh/history/off-state and no duplicate shelves | R8 | P2, P3, P4 | T3, T5, T6, T7 |
| 9. Focused existing backend and browser test suites | R9 | P4, P5 | T5, T6, T7 |
| 10. Run validation, manual demo and README instructions | R10 | P5 | T7, T8 |

Documentation audit:
- [x] All ten steps mapped across specification, plan and checklist.
- [x] All ten final acceptance criteria preserved below as release gates.
- [x] Exact lowercase badge text and exact disclaimer specified.
- [x] Products separate from evidence; current safety exclusions preserved.
- [x] Saved JSON and cached latest-response suppression explicitly planned.
- [x] Fixed examples, not runtime invention; real catalogue and Journey 2 excluded.
- [x] Fake-AI limitations and manual runtime verification identified.
- [x] No application implementation or test-completion claim made by these documents.

Clarifications made to keep the implementation bounded:
- False-by-default flag requires explicit demo enablement; production is effectively off.
- Relevant hairline answers are identified from a conservative validated-citation
  allowlist; wellbeing-source answers are excluded.
- Switch-off means backend restart plus refreshed load/revisit, not live push removal.
- The first two cards have ownership badges; all three have `Demo product` labels.
- No clinical sign-off is needed for the demonstration, but draft disclosures and
  existing production controls remain.

## 2. Execution tasks

For each task, mark complete only after its stated evidence exists. Record actual
commands/results or precise blockers in the implementation handoff, not invented
successes. Preserve unrelated changes and do not commit or push unless requested.

### T0. Confirm context

Dependencies: none.

- [x] Confirm current branch is `CrownED-001/trusted-advice`.
- [x] Inspect worktree status and preserve unrelated changes, including any existing frontend instructions.
- [x] Read the spec/plan and applicable repository/Next.js instructions before coding.
- [x] Inspect current Coach, API/history, types, health cache, prompt, fake AI and test helpers.
- [x] Confirm the shared backend was not reconfigured or restarted; its health response reported OpenAI mode and products disabled.

Completion evidence: branch and worktree were inspected; no environment changes or
service restarts were made. A concurrent commit appeared during implementation;
the remaining working changes were reviewed and left intact.

### T1. Define fixture, contract and capability

Dependencies: T0.

- [x] Add false-default `DEMO_PRODUCTS_ENABLED` and one production-aware effective capability.
- [x] Document the false default in the committed environment example, not real secrets/configuration.
- [x] Author the three exact fixture entries from R1 with stable IDs and order.
- [x] Include shelf version, shelf/item demo markers, disclaimer, descriptions and typed ownership metadata.
- [x] Keep all fixture content outside the evidence library and AI-generated text.
- [x] Add `demo_products_enabled` to health and corresponding frontend type.
- [x] Add optional, backward-compatible typed `CoachReply.demo_products`.
- [x] Confirm no migration, dependency or shopping metadata is introduced.

Completion evidence: exact fixture and capability tests pass in the focused backend
suite; no schema migration or dependency change was made.

### T2. Integrate recommendations and guarded product eligibility

Dependencies: T1.

- [x] Compute potential demo context from trusted retrieved article metadata.
- [x] Update prompt wording for optional fictional examples without inventing actual products or ownership.
- [x] Retain source-only recommendations, honest off-state limitations and all guards.
- [x] Compute final shelf eligibility from validated cited articles, capability and successful answer kind.
- [x] Exclude urgent, support, wellbeing-source, out-of-scope, rejected and unavailable/no-answer results.
- [x] Allow ordinary professional signposting alongside eligible products.
- [x] Attach exactly one server-authored fixture payload only after validation.
- [x] Ensure conditional prompt language cannot promise a missing shelf after final validation.
- [ ] Verify Amara receives all required guidance and referral links in an enabled live runtime; deterministic fake/API coverage is not live-model verification.
- [x] Provide an adequately grounded deterministic Amara scenario for tests; inspect runtime FakeAI limitations.

Completion evidence: deterministic source-grounded API scenario and eligibility,
safety, citation-rejection and service-error tests pass. Live-model wording remains
unverified.

### T3. Persist and safely serialize history

Dependencies: T2.

- [x] Save the optional payload with existing answer JSON.
- [x] Reuse current gating/serialization for POST and history.
- [x] Strip payload when currently disabled, including previously saved shelves.
- [x] Strip payload from historical non-answer kinds even if present in stored JSON.
- [x] Never mutate persistent JSON during history reads.
- [ ] Add a direct legacy-row test for messages predating the optional payload (new replies without it render normally; no backfill is implemented).
- [x] Preserve question, date, sources, action, links and correct Demo AI provenance.

Completion evidence: saved payload, switch-off suppression, non-answer suppression
and stored-JSON non-mutation tests pass. A separately constructed legacy-row test
and live disable/revisit check remain outstanding.

### T4. Build shared accessible response UI

Dependencies: T1, T2, T3.

- [x] Add successful-answer heading `Recommendations` and exact non-clinical explanation.
- [x] Add `Next steps` around the existing action.
- [x] Label professional guidance `When to seek professional support`; preserve guidance text and links.
- [x] Retain clickable article/external sources, truthful draft badges and recommendation-only provenance.
- [x] Render shelf after recommendations, action, professional support and sources.
- [x] Use exact heading `Example products — demonstration only`.
- [x] Display exact disclaimer before three cards.
- [x] Show three `Demo product` labels and first-two exact `black owned` badges.
- [x] Use semantic headings/lists, stable IDs, existing UI tokens and neutral icons/placeholders.
- [x] Add no external product images, purchase links, reviews, ratings or shop buttons.
- [x] Gate cached/latest/history shelves on current successful capability and valid optional payload.
- [x] Refetch capability/history on load/revisit instead of relying on five-minute cached enablement.
- [x] Keep capability loading/error disabled for display, with standard explicit error handling.
- [ ] Manually check existing themes, text-size and reading-font settings; responsive axe/overflow checks passed at phone/tablet/laptop sizes.

Completion evidence: focused mocked-response Playwright checks, including axe and
overflow assertions, pass on phone, tablet and laptop. Manual visual and preference
testing remains outstanding.

### T5. Extend backend tests

Dependencies: T2, T3; can proceed independently of T4.

- [x] Assert exact three entries, IDs, order, names, descriptions, demo markers and badge metadata.
- [x] Assert default-off, explicit-on, production effective-off and fake/real mode independence.
- [x] Assert eligible source-based results and ineligible unrelated/wellbeing-source results.
- [x] Assert urgent, support, out-of-scope, no-answer, rejected output and unavailable AI have no products.
- [x] Assert invented citations and diagnostic wording still fail safely.
- [ ] Assert ordinary signposting preserves relevant sources, action and referral links together (the integration test covers signposting, source and guidance; explicit referral-link assertion is outstanding).
- [ ] Add a prompt-contract assertion that context does not imply ungrounded brands/ownership or an unconditional shelf.
- [x] Assert stored payload persistence and history suppression when disabled.
- [ ] Add a direct legacy-row-without-payload history assertion.
- [x] Assert disable-after-save strips API payload without changing stored JSON.
- [x] Assert historically stored non-answer payload is suppressed.
- [x] Reuse existing tests/fake hooks and isolated fixture database; no live API spend.

Completion evidence: `cd backend && uv run pytest tests/test_coach.py
tests/test_ai_mode.py tests/test_openai_contract.py -q` — 40 passed, 0 failed.
The outstanding assertions above are not covered by this result.

### T6. Extend browser/end-to-end tests

Dependencies: T4; use T5's API coverage for real server-off persistence guarantees.

- [x] Add focused `trusted recommendations` test(s) to existing flow suite.
- [ ] Use isolated account and explicitly configured fake-AI demo backend with seeded library for E2E integration (the new E2E response routes are mocked).
- [ ] Test the canonical concern and a paraphrase against the running fake-AI backend without exact-question special casing (the backend test covers the canonical prompt; browser mock tests are not runtime-AI evidence).
- [x] Assert `Recommendations`, exact explanation, relevant visible sources and retained draft status in the controlled UI flow.
- [x] Assert `Next steps` and when-to-seek-help guidance with GP links in the controlled UI flow.
- [x] Assert exact product heading/disclaimer, three cards, three demo labels and two exact badges.
- [x] Assert recommendation/support sections precede the shelf in DOM order.
- [ ] Add explicit browser assertions for absence of unsupported treatment claims, contradictory refusal and shopping actions.
- [ ] Verify live reload/revisit, genuine legacy history, and exactly one shelf per stored answer (the mocked flow covers reload and repeat submissions only).
- [x] Test capability disabled after a cached product response, including the latest reply.
- [ ] Add browser coverage for negative response kinds and capability loading/failure error UI.
- [x] Run across configured phone, tablet and laptop projects without horizontal overflow.
- [ ] Check light/dark/high-contrast plus larger text and easier-reading font.
- [x] Reuse axe and console-error helpers; distinguish route mocks from unmocked integration evidence.

Completion evidence: `cd frontend && npm run test:e2e -- --grep "trusted
recommendations"` — 6 passed across phone, tablet and laptop, 0 failed. The
positive and capability-off API routes were controlled mocks; this is not an
unmocked AI integration run.

### T7. Run verification and demonstrate

Dependencies: T5, T6.

- [x] Run focused backend tests from P5, including other touched test files if needed.
- [x] Run `npm run check`.
- [x] Run `npm run test:e2e -- --grep "trusted recommendations"`; Playwright used the controlled routes documented in T6.
- [x] Report failures and unrelated baseline warnings accurately; missing Chromium was installed, then all selected browser checks passed.
- [ ] Manually submit the canonical prompt and a paraphrase in an enabled demo runtime.
- [ ] Confirm source relevance, next steps, professional guidance and absence of contradictory refusal in the enabled live runtime.
- [ ] Verify configured runtime AI path; do not claim real-AI quality from fake responses.
- [ ] With authorization, disable demo flag, restart, reload/revisit and confirm old shelves disappear.
- [ ] Confirm old records remain stored and re-enable only the agreed demo configuration.
- [x] Review final diff scope and whitespace; no environment files or dependencies were changed.

Completion evidence: focused commands and results are recorded in T5-T6. Live
manual testing was not performed because the shared backend was configured for
OpenAI and reported the product capability disabled; its configuration was not
changed.

### T8. Document and hand off

Dependencies: T7.

- [x] Update README to distinguish demo shelf from still-future real catalogue.
- [x] Document exact switch, default-off, production-off, restart/reload and AI-mode independence.
- [x] Document canonical prompt, fictional products/ownership labels and no medical/product endorsement.
- [x] Retain draft disclosures and existing production restrictions.
- [x] Update release gates below with the evidence currently available and explicit limitations.
- [x] Provide concise implementation summary, test results, limitations and remaining blockers.
- [x] Do not claim 10/10 or check unverified items; do not commit/push without instruction.

## 3. Final acceptance checklist

| Gate | Verification | Status |
|---|---|---|
| AC1 | Amara concern yields a successful, relevant answer | Partial — deterministic backend test passes; enabled live runtime not tested |
| AC2 | `Recommendations` and exact non-clinical explanation | Verified in focused UI test |
| AC3 | Relevant visible/clickable article and external sources | Verified in controlled UI test, including draft disclosure |
| AC4 | Exactly three fictional cards in stable order | Verified in controlled UI test |
| AC5 | First two exact `black owned` badges; all three `Demo product` labels | Verified in controlled UI test |
| AC6 | Exact fictional products/ownership disclaimer | Verified in controlled UI test |
| AC7 | Useful tension recommendations, next steps and when-to-seek-help guidance/links | Partial — deterministic API and controlled UI coverage; live answer not tested |
| AC8 | No contradictory refusal, fabricated treatment/ownership claims or shopping functionality | Partial — fixed fixture and prompt are implemented; explicit negative-claim assertions remain |
| AC9 | Mobile, refresh/revisit, saved/legacy history and disabling work | Partial — responsive mocked flow and backend suppression tests pass; live revisit and legacy-row test remain |
| AC10 | Existing safety handling and focused automated validation pass | Verified by 40 backend tests, frontend check and 6 responsive E2E tests |

## 4. Implementation handoff evidence to supply

Supply the following in the final implementation report:

| Evidence | Required detail |
|---|---|
| Scope | Branch: `CrownED-001/trusted-advice`; implementation and focused-test files changed; no migration/dependency changes |
| Configuration | Flag defaults off and is production-off; independent of AI mode; restart/reload behavior documented. Shared runtime reported OpenAI and products disabled; no secrets or runtime settings changed |
| Backend | `uv run pytest tests/test_coach.py tests/test_ai_mode.py tests/test_openai_contract.py -q` — 40 passed |
| Frontend | `npm run check` — passed (`tsc --noEmit`; `Effects OK`) |
| Browser | `npm run test:e2e -- --grep "trusted recommendations"` — 6 passed, phone/tablet/laptop; route responses mocked; themes not covered |
| Manual | Enabled canonical/paraphrase flow and live switch-off/revisit not performed; shared service was left unchanged |
| Acceptance | See AC1-AC10 above; outstanding live runtime, theme, and additional legacy/negative assertions remain |

Checked items represent completed implementation or executed evidence, not
clinical validation or production readiness. Remaining unchecked items are
explicit follow-up work; the current evidence does not establish a 10/10 result.
