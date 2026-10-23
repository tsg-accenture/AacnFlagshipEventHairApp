# CrownED-001 implementation agent checklist

Status: planning documents aligned; application tasks below are not started.
Branch: `CrownED-001/trusted-advice`.
Read [specification](./spec.md) first, then [implementation plan](./implementation-plan.md).
Checked boxes below refer only to the documentation alignment audit; unchecked
boxes are implementation/verification work for the implementation agent.

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

- [ ] Confirm current branch is `CrownED-001/trusted-advice`.
- [ ] Inspect worktree status and preserve unrelated changes, including any existing frontend instructions.
- [ ] Read the spec/plan and applicable repository/Next.js instructions before coding.
- [ ] Inspect current Coach, API/history, types, health cache, prompt, fake AI and test helpers.
- [ ] Confirm demo backend ownership/configuration before any service restart or environment change.

Completion evidence: named branch, scoped file list, no conflicting edits.

### T1. Define fixture, contract and capability

Dependencies: T0.

- [ ] Add false-default `DEMO_PRODUCTS_ENABLED` and one production-aware effective capability.
- [ ] Document the false default in the committed environment example, not real secrets/configuration.
- [ ] Author the three exact fixture entries from R1 with stable IDs and order.
- [ ] Include shelf version, shelf/item demo markers, disclaimer, descriptions and typed ownership metadata.
- [ ] Keep all fixture content outside the evidence library and AI-generated text.
- [ ] Add `demo_products_enabled` to health and corresponding frontend type.
- [ ] Add optional, backward-compatible typed `CoachReply.demo_products`.
- [ ] Confirm no migration, dependency or shopping metadata is introduced.

Completion evidence: contract/fixture review and capability tests in T5.

### T2. Integrate recommendations and guarded product eligibility

Dependencies: T1.

- [ ] Compute potential demo context from trusted retrieved article metadata.
- [ ] Update prompt wording for optional fictional examples without inventing actual products or ownership.
- [ ] Retain source-only recommendations, honest off-state limitations and all guards.
- [ ] Compute final shelf eligibility from validated cited articles, capability and successful answer kind.
- [ ] Exclude urgent, support, wellbeing-source, out-of-scope, rejected and unavailable/no-answer results.
- [ ] Allow ordinary professional signposting alongside eligible products.
- [ ] Attach exactly one server-authored fixture payload only after validation.
- [ ] Ensure conditional prompt language cannot promise a missing shelf after final validation.
- [ ] Verify Amara receives tension-reduction recommendations, practical action and when-to-seek-help guidance/links.
- [ ] Provide an adequately grounded deterministic Amara scenario for tests; inspect runtime FakeAI limitations.

Completion evidence: positive, negative, grounding and pre/post-eligibility tests.

### T3. Persist and safely serialize history

Dependencies: T2.

- [ ] Save the optional payload with existing answer JSON.
- [ ] Reuse current gating/serialization for POST and history.
- [ ] Strip payload when currently disabled, including previously saved shelves.
- [ ] Strip payload from historical non-answer kinds even if present in stored JSON.
- [ ] Never mutate persistent JSON during history reads.
- [ ] Keep older messages without products valid; do not backfill shelves.
- [ ] Preserve question, date, sources, action, links and correct Demo AI provenance.

Completion evidence: saved-payload, legacy-message, switch-off and non-mutation assertions.

### T4. Build shared accessible response UI

Dependencies: T1, T2, T3.

- [ ] Add successful-answer heading `Recommendations` and exact non-clinical explanation.
- [ ] Add `Next steps` around the existing action.
- [ ] Label professional guidance `When to seek professional support`; preserve guidance text and links.
- [ ] Retain clickable article/external sources, truthful draft badges and recommendation-only provenance.
- [ ] Render shelf after recommendations, action, professional support and sources.
- [ ] Use exact heading `Example products — demonstration only`.
- [ ] Display exact disclaimer before three cards.
- [ ] Show three `Demo product` labels and first-two exact `black owned` badges.
- [ ] Use semantic headings/lists, stable IDs, existing UI tokens and neutral icons/placeholders.
- [ ] Add no external product images, purchase links, reviews, ratings or shop buttons.
- [ ] Gate cached/latest/history shelves on current successful capability and valid optional payload.
- [ ] Refetch capability/history on load/revisit instead of relying on five-minute cached enablement.
- [ ] Keep capability loading/error disabled for display, with standard explicit error handling.
- [ ] Check phone/tablet/laptop layouts and existing themes, text-size and reading-font settings.

Completion evidence: browser assertions and manual visual/accessibility review.

### T5. Extend backend tests

Dependencies: T2, T3; can proceed independently of T4.

- [ ] Assert exact three entries, IDs, order, names, descriptions, demo markers and badge metadata.
- [ ] Assert default-off, explicit-on, production effective-off and fake/real mode independence.
- [ ] Assert eligible source-based results and ineligible unrelated/wellbeing-source results.
- [ ] Assert urgent, support, out-of-scope, no-answer, empty/rejected output and unavailable AI have no products.
- [ ] Assert invented citations and diagnostic wording still fail safely.
- [ ] Assert ordinary signposting preserves relevant sources, action and referral links.
- [ ] Assert prompt context does not imply ungrounded brands/ownership or unconditional shelf availability.
- [ ] Assert stored payload fidelity and history without products for legacy rows.
- [ ] Assert disable-after-save strips API payload without changing stored JSON.
- [ ] Assert historically stored non-answer payload is suppressed.
- [ ] Reuse existing tests/fake hooks and isolated fixture database; no live API spend.

Completion evidence: focused backend command, pass/fail counts, and any warnings.

### T6. Extend browser/end-to-end tests

Dependencies: T4; use T5's API coverage for real server-off persistence guarantees.

- [ ] Add focused `trusted recommendations` test(s) to existing flow suite.
- [ ] Use isolated account and explicitly configured fake-AI demo backend with seeded library.
- [ ] Test canonical concern and a paraphrase without exact-question special casing.
- [ ] Assert `Recommendations`, exact explanation, relevant visible sources and retained draft status.
- [ ] Assert useful `Next steps` and when-to-seek-help guidance with GP/specialist links.
- [ ] Assert exact product heading/disclaimer, three cards, three demo labels and two exact badges.
- [ ] Assert source/professional-support sections precede the shelf in DOM order.
- [ ] Assert no unsupported treatment claims, contradictory refusal or shopping actions.
- [ ] Test reload, away/back navigation, legacy history and repeated submissions: one shelf per answer.
- [ ] Test capability disabled after cached product response, including cached latest reply.
- [ ] Test negative response kinds and capability loading/failure with explicit error UI.
- [ ] Run across configured phone, tablet and laptop projects without horizontal overflow.
- [ ] Check light/dark/high-contrast plus larger text and easier-reading font.
- [ ] Reuse axe and console-error helpers; distinguish route mocks from unmocked integration evidence.

Completion evidence: selected Playwright results, accessibility and layout checks.

### T7. Run verification and demonstrate

Dependencies: T5, T6.

- [ ] Run focused backend tests from P5, including other touched test files if needed.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:e2e -- --grep "trusted recommendations"` under the documented isolated demo configuration.
- [ ] Report failures and unrelated baseline warnings accurately; fix only related regressions.
- [ ] Manually submit canonical prompt and paraphrase in running app.
- [ ] Confirm source relevance, next steps, professional guidance and absence of contradictory refusal.
- [ ] Verify configured runtime AI path; do not claim real-AI quality from fake responses.
- [ ] With authorization, disable demo flag, restart, reload/revisit and confirm old shelves disappear.
- [ ] Confirm old records remain stored and re-enable only the agreed demo configuration.
- [ ] Review final diff for unrelated changes and secrets.

Completion evidence: commands/results, manual observations and any unresolved blockers.

### T8. Document and hand off

Dependencies: T7.

- [ ] Update README to distinguish demo shelf from still-future real catalogue.
- [ ] Document exact switch, default-off, production-off, restart/reload and AI-mode independence.
- [ ] Document canonical prompt, fictional products/ownership labels and no medical/product endorsement.
- [ ] Retain draft disclosures and existing production restrictions.
- [ ] Complete release gates below with evidence.
- [ ] Provide concise implementation summary, test results, limitations and remaining blockers.
- [ ] Do not claim 10/10 or check unverified items; do not commit/push without instruction.

## 3. Final acceptance checklist

| Gate | Verification | Status |
|---|---|---|
| AC1 | Amara submits concern and obtains successful relevant answer | [ ] |
| AC2 | `Recommendations` and exact non-clinical explanation | [ ] |
| AC3 | Relevant visible/clickable article and external sources | [ ] |
| AC4 | Exactly three fictional cards in stable order | [ ] |
| AC5 | First two exact `black owned` badges; all three `Demo product` labels | [ ] |
| AC6 | Exact fictional products/ownership disclaimer | [ ] |
| AC7 | Useful tension recommendations, next steps and when-to-seek-help guidance/links | [ ] |
| AC8 | No contradictory refusal, fabricated treatment/ownership claims or shopping functionality | [ ] |
| AC9 | Mobile, refresh/revisit, saved/legacy history and disabling work | [ ] |
| AC10 | Existing safety handling and focused automated validation pass | [ ] |

## 4. Implementation handoff evidence to supply

Supply the following in the final implementation report:

| Evidence | Required detail |
|---|---|
| Scope | Branch and files changed; migration/dependency status |
| Configuration | Effective demo setting, AI mode, restart/reload behaviour; no secrets |
| Backend | Exact command, pass/fail counts, warnings |
| Frontend | Exact check command and result |
| Browser | Exact selector/command, projects/themes covered, results |
| Manual | Prompt/paraphrase, output sections, source relevance, disable/revisit outcome |
| Acceptance | AC1-AC10 results with explicit blockers for unverified items |

Leave implementation boxes unchecked until actual execution. This documentation
audit confirms alignment, not delivery of the application feature.
