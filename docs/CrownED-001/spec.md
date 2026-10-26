# CrownED-001: Trusted recommendations demonstration

Status: specified; application implementation not started.
Branch: `CrownED-001/trusted-advice`.
Scope: Journey 1 demonstration only.

Companion documents:
- [Implementation plan](./implementation-plan.md)
- [Implementation checklist and alignment audit](./tasks.md)

## 1. Outcome

Amara describes a thinning hairline after protective styles. Within one Hair Coach
answer she receives general recommendations, visible relevant sources, practical
next steps, professional-support guidance and three fictional example products.
At least the first two products visibly carry the exact text `black owned`.

A 10/10 means verified completeness for this demonstration, not clinical validation,
production readiness, a medical assessment or a genuine product endorsement.
This document specifies future behaviour; it does not assert it is implemented.

Canonical acceptance prompt:

> My hairline is thinning after wearing protective styles. What should I do, when
> should I seek professional help, and can you suggest three Black owned products?

Also support the same concern without explicitly requesting products. Do not
implement a special-case exact-string match for the canonical prompt.

## 2. Current implementation and constraints

| Surface | Observed implementation | Consequence |
|---|---|---|
| [Coach pipeline](../../backend/app/ai/coach.py) | Moderation, triage, retrieval, answer generation, citation and wording guards | Attach products only after a successful guarded answer; preserve all earlier exits |
| [Coach prompt](../../backend/app/prompts/coach_v1.md) | Library-only answer, one action, `signpost` boolean | Keep health information grounded; do not make fictional products evidence |
| [Coach API](../../backend/app/api/v1/coach.py) | Stores answer dictionaries as JSON; history spreads saved answers | Additive optional payload; read-time suppression must cover saved answers |
| [Ask page](../../frontend/app/(app)/ask/page.tsx) | Shared `Reply` component for latest answer and history | One shared rendering path should cover both |
| [Sources](../../frontend/components/Sources.tsx) | Article links, external sources and draft/review status | Retain truthful review status and clickable attribution |
| [Settings](../../backend/app/core/config.py) | Cached environment configuration; no demo-products switch | Add one opt-in backend flag, independent of `AI_MODE` |
| [Health endpoint](../../backend/app/main.py) and [health hook](../../frontend/lib/hooks.ts) | Health response exposes non-secret capabilities; query has five-minute stale time | Add current capability status and explicitly address stale UI |
| [Types](../../frontend/lib/types.ts) | `CoachReply` has no product payload | Add typed, backward-compatible optional fields |
| [Coach tests](../../backend/tests/test_coach.py) | Fake AI, citations, triage, history and guards | Extend these tests rather than introduce a runner |
| [Browser tests](../../frontend/e2e/flows.spec.ts) | Isolated accounts, axe, console checks and existing responsive projects | Extend current flows and helpers |

No database migration, new dependency, real catalogue, checkout or external image
service is needed. Current draft content can be used only in an explicitly
non-clinical demonstration; do not relax production startup checks to enable it.

## 3. Functional requirements

### R1. Fixed fictional content

Author the following versioned, deterministic fixture outside `content/library/`.
The implementation agent authors it once; the runtime model does not generate it.

| Stable ID | Name | Fictional brand | General care description | Ownership badge |
|---|---|---|---|---|
| `demo-gentle-cleanse` | Gentle Cleanse Shampoo | Demo Crown Care A | Fictional example of a shampoo for routine cleansing. | `black owned` |
| `demo-soft-touch` | Soft Touch Conditioner | Demo Crown Care B | Fictional example of a rinse-out conditioner for a regular wash routine. | `black owned` |
| `demo-lightweight-moisture` | Lightweight Moisture Spray | Demo Crown Care C | Fictional example of a lightweight spray for a general moisture routine. | none |

Every card must also show `Demo product`. Order is exactly the table order.
Do not claim that these examples treat thinning, restore hairlines, prevent hair
loss or are individually suitable for Amara. No price, rating, review, retailer,
purchase URL, affiliate link, shopping action or real brand/ownership claim.

Display this exact section-level disclaimer before the cards:

> Fictional products and ownership labels for demonstration only. These are not real brands or treatments for hair loss.

Ownership badges are fictional UI demonstrations, not verified business facts.
The disclaimer and each card's demo label must remain visible on small screens.

### R2. Non-clinical framing

Successful answers use the heading `Recommendations` and this explanation:

> General hair-care recommendations, not clinical advice or a diagnosis.

Do not apply that heading to urgent, support, out-of-scope or unsuccessful answers
in a way that recasts them as ordinary recommendations. Preserve source links,
draft badges, model provenance and existing safety messages.
The feature switch controls products, not whether successful answers use this framing.

### R3. Explicit, safe feature switch

Add `DEMO_PRODUCTS_ENABLED`, a backend boolean defaulting to `false`, including
in the committed environment example. A demo operator explicitly enables it in
the demonstration deployment and restarts the backend.

The effective capability must be false in `APP_ENV=production`, even if the
raw flag is true. Do not invent an unsupported `APP_ENV=demo` value. The documented
demo uses the existing development environment, with access appropriate to a demo.
Expose only the effective, non-secret capability as `demo_products_enabled` in
the existing health response.

The switch is independent of fake/OpenAI selection. Fake AI does not automatically
enable products, and real AI does not automatically disable them.

Eligibility requires:
1. Effective capability enabled.
2. Successful `kind="answer"` after existing moderation, triage and output guards.
3. Relevant source-grounded care content, determined on the server, not solely by
   the presence of the word "product" in the user's question.
4. Not a wellbeing-support response or wellbeing-only recommendation.

For this bounded hairline demonstration, use validated cited article IDs to
identify relevant advice: `tight-styles-and-your-edges`,
`signs-a-style-is-too-tight`, or `early-changes`. Exclude any answer citing
`hair-loss-and-how-you-feel` from the shelf. This deliberately conservative
eligibility policy is not a general product-matching engine. Derive IDs from the
validated cited hits, not from uncited search results or an AI ownership assertion.

`signpost=true` alone is not an exclusion: ordinary GP signposting belongs in
Amara's answer. Urgent `see_someone_now`, `support`, `out_of_scope`,
`no_reviewed_answer`, validation rejection and service-error paths never get products.

### R4. Structured, separate payload and storage

Add an optional `demo_products` object to the successful response:

```json
{
  "demo_products": {
    "version": "v1",
    "is_demo": true,
    "disclaimer": "Fictional products and ownership labels for demonstration only. These are not real brands or treatments for hair loss.",
    "items": [
      {
        "id": "demo-gentle-cleanse",
        "name": "Gentle Cleanse Shampoo",
        "brand": "Demo Crown Care A",
        "description": "Fictional example of a shampoo for routine cleansing.",
        "is_demo": true,
        "ownership_badge": "black owned"
      }
    ]
  }
}
```

The example above illustrates one item only; an actual shelf must contain all
three R1 items. For the third item, `ownership_badge` is `null`. Use proper Python
and TypeScript types; no loosely cast frontend payloads. No products is represented
by the absence of `demo_products`, not an empty or success-shaped placeholder shelf.

Attach the server-authored payload separately from model text and sources.
Persist it with the existing JSON answer. Use shared serialization/gating for
POST and history, without mutating the persisted answer on a read.
Older messages without this field remain valid; do not backfill products into them.
If the feature is disabled, strip the payload from responses even when stored.
If an old non-answer contains a payload, suppress it rather than trust its presence.

### R5. No contradictory product refusal

The current live answer correctly refuses to invent real Black-owned products.
With an eligible demo shelf, it must instead distinguish fictional examples from
actual product recommendations without saying no examples are available.

Before model generation, determine potential demo eligibility from trusted
retrieval metadata and pass only a trusted capability/context instruction.
After generation, determine final attachment from validated citations and answer
kind. If the model is told that a shelf is available, final successful output
must not promise a shelf that is not attached; test this pre/post-validation edge.
Prefer wording such as "Any demo examples shown are fictional" rather than an
unconditional promise that products will follow.

With products disabled, retain the honest limitation on real product suggestions.
Never remove arbitrary refusal sentences by string replacement, fabricate
citations, send the fixture as evidence or bypass moderation/wording checks.
The source-attribution footer must clearly refer to recommendations only, not
to server-authored fictional cards.

### R6. Display and accessibility

Within each successful answer, display the following order:
1. User question and date.
2. `Recommendations`, non-clinical explanation and recommendation text.
3. `Next steps` and the practical action, where available.
4. `When to seek professional support`, relevant guidance and existing referral links.
5. Sources and review disclosures, with recommendation-specific model provenance.
6. `Example products — demonstration only`, disclaimer and three cards, if eligible.

The professional-support section is required for Amara's canonical concern, not
every unrelated successful question. Do not manufacture a clinical instruction
when the guarded answer lacks adequate grounding.

Reuse existing card, icon, colour, typography and spacing patterns. Badges must
be readable text, not colour-only marks. Use semantic headings/lists, stable keys
and original neutral placeholders or existing icons. Preserve light, dark,
high-contrast, enlarged-text and easier-reading font settings. No horizontal page
overflow at phone, tablet or laptop widths.

### R7. Recommendations, next steps and signposting remain useful

For Amara's scenario, recommend practical reduction of tension using library
content, show a useful next action, and explain when to contact a GP/specialist,
with existing destination links. Links alone do not satisfy "when to seek help".
No diagnosis, medication dosing, invented product efficacy or false reassurance.

Normal signposting and emergency handling must not be weakened to display cards.
Preserve the existing content review status; do not label draft material reviewed.

### R8. History, reload and disable behaviour

- Latest and historical responses use the same rendering path.
- Reload/navigation preserves the stored shelf when still enabled and eligible.
- Repeated questions create separate answers, with exactly one shelf per answer.
- Historical answers without product data render without a shelf.
- Disabled products are hidden for both newly returned and saved messages.
- On a fresh load, render products only after a successful current capability
  response explicitly enables them; missing/loading/failed capability is not enabled.
- After an operator disables the flag and restarts the backend, reload/revisit
  must refetch capability and history instead of trusting the five-minute cache.
  Refresh on route mount and reconnect/focus as appropriate using existing query
  patterns. Do not add polling or promise instant removal in an inactive open tab.
- A disabled capability hides even a cached latest response carrying old products.
  Existing request errors remain visible through standard error UI.

### R9. Focused verification

Backend tests must assert exact count, fixture IDs/order/text, item and shelf demo
markers, first-two badge spelling, no treatment/shopping metadata, saved payload,
old-message compatibility and current read-time suppression. Cover all safety
exclusions, rejected citations/wording, empty/no-answer and unavailable AI.
Test flag defaults, production effective-off and independence from AI mode.

Browser tests must exercise the canonical concern, exact headings, sources,
support text and links, three cards, two exact badges, all three demo labels and
disclaimer. Assert DOM order, one shelf per reply, reload/history, legacy history,
off-state with cached payload, negative responses, mobile/tablet/laptop layouts,
themes, accessibility and no uncaught console errors.

Use deterministic fake/fixture AI for automated runs and existing test frameworks.
The current canned reply only selects a passage's first line and sets
`signpost=false`; that alone cannot verify the full Amara narrative. Provide a
source-grounded deterministic scenario response using existing fake hooks/test
fixtures, and separately manually validate actual runtime AI if configured.
Do not hardcode medical claims solely to make a test pass.

### R10. Documentation and final demonstration

Update the README to explain switch defaults, effective production-off policy,
restart/reload behaviour, fake-versus-real AI, example prompt, fictional ownership
labels and limitations. Retain that the real catalogue remains future work.

Run focused backend tests, existing frontend checks and relevant browser tests.
Record commands, results and any blockers in the implementation handoff. Manually
walk the exact journey and check the answer does not contradict the shelf.
Clinical sign-off is not required for this non-clinical demo; existing clinical
review and production restrictions still apply.

## 4. Out of scope

Real products, ownership verification, retailer integrations, purchase links,
affiliate functionality, checkout, ingredient matching, a recommendation engine,
runtime-generated mock brands, external images, push reminders, Journey 2
changes, medical diagnosis and clinical approval work.

## 5. Acceptance gates

| ID | Required observable result |
|---|---|
| AC1 | Amara can submit the concern, including with a request for products |
| AC2 | Successful answer says `Recommendations` with the exact non-clinical explanation |
| AC3 | Relevant article and external source links remain visible and clickable |
| AC4 | Exactly three fictional cards appear in stable order |
| AC5 | At least the first two carry exact `black owned` text; all say `Demo product` |
| AC6 | Exact fictional-products/ownership disclaimer is visible |
| AC7 | Useful tension-reduction recommendations, `Next steps` and `When to seek professional support` guidance/links appear |
| AC8 | No contradictory refusal, treatment claim, real ownership claim or shopping functionality |
| AC9 | Mobile, refresh/revisit, saved and legacy history work; disabled shelf stays hidden |
| AC10 | Existing safety handling and focused automated checks pass |

All gates are required before reporting 10/10 demo readiness. Passing a mocked
browser test alone is not evidence of live model quality or a real end-to-end API
integration; retain both API and manual-flow evidence.
