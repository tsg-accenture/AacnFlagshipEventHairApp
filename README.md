# Crown AI · v1-base

Crown AI is a hair and scalp health and education app for Black hair. This folder is the first working build from the **Crown AI Build Plan**: the plan's Phases 0 to 4, which the plan calls the first complete working release.

- **Frontend:** Next.js 16 (App Router, TypeScript, Tailwind 4). It runs on phone, tablet and laptop from the same pages.
- **Backend:** Python FastAPI. It is the only part that reads the database, the photo store and your OpenAI key.
- **Database:** a SQLite file for local development, so there is no database server or Docker to install. Production uses Postgres with pgvector, which this build also supports (see [Use Postgres instead](#use-postgres-instead-optional)).

Crown AI gives general guidance and signposting. It does not diagnose.

> **Draft content.** The clinical rules, library articles, check-in questions and care templates in this build were written by the build team from public sources, so every flow can be tried. They are all marked draft and must be reviewed by your clinical advisor before real users see them. See [Before real users](#before-real-users).

---

## Contents

1. [What you need](#what-you-need)
2. [Run it (about 10 minutes)](#run-it-about-10-minutes)
3. [Use your OpenAI key](#use-your-openai-key)
4. [Use Postgres instead (optional)](#use-postgres-instead-optional)
5. [What's in v1-base](#whats-in-v1-base)
6. [How it works](#how-it-works)
7. [Tests](#tests)
8. [Advisor tools](#advisor-tools)
9. [Before real users](#before-real-users)
10. [Where this build differs from the plan](#where-this-build-differs-from-the-plan)
11. [Troubleshooting](#troubleshooting)
12. [Project layout](#project-layout)

---

## What you need

| Tool | Version | Check | Install |
|---|---|---|---|
| Node.js | 20.9 or newer (built and tested with 22) | `node -v` | [nodejs.org](https://nodejs.org) |
| uv (Python project manager) | any recent | `uv --version` | `brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| OpenAI API key | optional to start | | [platform.openai.com](https://platform.openai.com/api-keys) |

You don't need Docker or a database server. The database is a single SQLite file the backend creates for you at `backend/var/crown.db` (SQLite is built into Python). You don't need to install Python yourself either: the backend needs Python 3.12 or newer, and by default uv downloads a suitable Python when one is needed.

---

## Run it (about 10 minutes)

The first run uses **Demo AI**: canned AI replies, so you can click through every flow without an OpenAI key. That's because `OPENAI_API_KEY` starts blank and `AI_MODE=auto` falls back to Demo AI without one. The app shows a "Demo AI" badge while it's on.

### 1. Start the backend (terminal 1)

From this folder (`v1-base`):

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and replace the two `change-me` values (`SAFETY_ID_SALT` and `SESSION_SECRET`) with long random strings. macOS can make one for you; run this twice and paste each result:

```bash
openssl rand -hex 32
```

Then:

```bash
uv sync                                    # installs the exact versions in uv.lock
uv run alembic upgrade head                # creates the database file backend/var/crown.db and its tables
uv run python -m app.jobs.ingest_library   # loads the draft library and its embeddings
uv run uvicorn app.main:app --reload --port 8000
```

Check it's up: <http://localhost:8000/api/v1/health> should show `"status":"ok"`. The interactive API docs are at <http://localhost:8000/api/docs> (development only).

To start again with an empty database, stop the backend, delete the `backend/var/crown.db` files (`crown.db`, and `crown.db-wal` and `crown.db-shm` if they're there), then run the `alembic` and `ingest_library` commands again.

### 2. Start the frontend (terminal 2)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### 3. Open the app

Go to <http://localhost:3000> and choose **Get started**. You'll create an account, see the data receipt, then go through the onboarding chat. A few things to try:

- **Today:** answer the day-3 check-in card with "It hurts" to see a rules-based outcome.
- **Ask:** ask "How tight should my braids be?" to get an answer with its sources.
- **Check:** check a zone with questions only, then open the **Map**.
- **Get checked:** download a care pack PDF. **Stylist note:** tick lines and write a note.
- **Settings:** try dark mode, high contrast, map patterns, larger text and the easier-to-read font.

### Trusted recommendations demonstration

The optional `DEMO_PRODUCTS_ENABLED` backend setting defaults to `false`. For a
non-production demonstration, set `DEMO_PRODUCTS_ENABLED=true` in `backend/.env`
and restart the backend. This is independent of `AI_MODE`: Demo AI does not turn
the shelf on automatically, and OpenAI does not turn it off. The shelf remains
effectively disabled whenever `APP_ENV=production`, even if the raw setting is
true.

Try: “My hairline is thinning after wearing protective styles. What should I do,
when should I seek professional help, and can you suggest three Black owned
products?” A paraphrase without the product request is also supported. Products
appear only beside a successful answer grounded in the relevant cited library
articles. Ordinary professional signposting can appear with them; urgent,
wellbeing-support and unsuccessful answers cannot.

The cards are fixed fictional examples. Their `black owned` labels are UI
demonstrations, not verified business facts or real ownership claims. The products
are not treatments, clinical advice, endorsements or individually suitable
recommendations. There are no prices or purchase links. The actual product
catalogue and ownership verification remain future work. Changing the setting
requires a backend restart; after disabling it, reload or revisit Ask so the
current health capability and history are fetched again. The shelf is hidden
while capability status is loading or unavailable.

---

## Use your OpenAI key

1. Open `backend/.env` and set your key:

   ```bash
   OPENAI_API_KEY=sk-...your key...
   AI_MODE=auto
   ```

   With `AI_MODE=auto` (the default), a key switches the app to OpenAI. If your `.env` came from an older copy and says `AI_MODE=fake`, change it: `fake` keeps Demo AI on and ignores the key.

2. Restart the backend (`Ctrl+C`, then the `uvicorn` command again). The backend reads `.env` only when it starts, and `--reload` only watches code.

3. Check the backend terminal. It should say `AI: OpenAI at https://api.openai.com/v1 ...`. If it says `Your OPENAI_API_KEY is set but NOT used`, go back to step 1.

On that first start the backend also re-embeds the library with OpenAI's embedding model, because Demo AI's embeddings don't match it. It does this by itself in development. You'll see `Library embedded with text-embedding-3-small: ... updated`. (`uv run python -m app.jobs.ingest_library` still works if you'd rather run it yourself.)

**Seeing the calls.** Every OpenAI call prints one line in the backend terminal, without any of the content, for example:

```
INFO crown.ai OpenAI responses gpt-6-luna (coach_answer): completed in 812 ms, tokens in/out 1450/120
```

Failed calls print a warning with OpenAI's own message, such as a wrong key, a model your account can't use, or a blocked network. To list the most recent calls:

```bash
cd backend
uv run python -m app.jobs.ai_calls        # or: ... ai_calls 100
```

In the app, the "Demo AI" badge disappears, and Settings → About this build says OpenAI is on.

**Why the OpenAI dashboard can look empty.** Every call sends `store=false`, so OpenAI doesn't keep the responses (this is part of the privacy plan). According to [OpenAI's developer forum](https://community.openai.com/t/does-store-false-prevent-request-response-bodies-from-appearing-in-platform-logs-for-organization-admins/1387766), such calls don't appear on the dashboard's Logs page, but their token use does show on the Usage page. Use the backend terminal or the `ai_calls` command above to see each call.

The key stays in `backend/.env`. It is never prefixed `NEXT_PUBLIC_`, never sent to the browser, and `.env` files are in `.gitignore`.

**Which models it calls.** These are set in `backend/.env`, with the plan's starting points as defaults:

| Job | Setting | Default |
|---|---|---|
| Describe what a zone photo shows (Structured Outputs) | `OPENAI_MODEL_VISION` | `gpt-6.1-sol` |
| Hair Coach answers, explanations, onboarding text, plan intro, stylist-note polish | `OPENAI_MODEL_TEXT` | `gpt-6-luna` |
| Photo quality checks, question triage, the "no diagnosis" check (Decisions API, beta) | `OPENAI_MODEL_DECISIONS` | `gpt-6-luna` |
| Library search | `OPENAI_MODEL_EMBEDDINGS` | `text-embedding-3-small` |
| Screening every typed message and photo | `OPENAI_MODEL_MODERATION` | `omni-moderation-latest` |

If your account can't use one of these models, the backend terminal shows OpenAI's error message and the app answers with a clear "AI service didn't respond" message. Change the model name in `.env` and restart. If the Decisions API (public beta) fails, the backend falls back to Responses with Structured Outputs automatically.

**Every call** goes from the backend only, with `store=false`, a hashed `safety_identifier` (never an email or name), `reasoning.effort=low` and a `max_output_tokens` limit. The `ai_calls` table logs the model, tokens, latency and status of each call, but never photo, question text or health details.

**Azure OpenAI.** This build targets `api.openai.com`. If your key is for Azure OpenAI, model names become deployment names and the Decisions API may not exist there. Tell your developer before switching.


---

## Use Postgres instead (optional)

You don't need this to run or try the app. SQLite is fine for one person on a laptop, but production needs Postgres with the pgvector extension (the plan's database). The server refuses to start with `APP_ENV=production` on SQLite. Use Postgres locally if you want to match production, or to run the tests against it.

Any recent Postgres with pgvector works (the tests here ran on Postgres 16). Two ways to get one on a Mac without Docker:

- **Homebrew** (if your Mac allows it). The `pgvector` formula is built for `postgresql@17` and `postgresql@18`:

  ```bash
  brew install postgresql@18 pgvector
  brew services start postgresql@18
  "$(brew --prefix postgresql@18)/bin/createdb" crown
  ```

  `postgresql@18` is keg-only, which is why `createdb` needs its full path. Homebrew's database lets your Mac user in from this computer without a password.

- **[Postgres.app](https://postgresapp.com)**, which bundles pgvector. Start a server in the app, then create a database called `crown`.

Then point the backend at it in `backend/.env`, using your Mac user name:

```bash
DATABASE_URL=postgresql+psycopg://YOUR_MAC_USER_NAME@localhost:5432/crown
```

Run `uv run alembic upgrade head` (it switches on pgvector in the database) and `uv run python -m app.jobs.ingest_library`, then restart the backend. Nothing moves across from the SQLite file, so you'll create a new account.

On a machine where Docker is allowed, `docker compose up -d db` in this folder starts Postgres 18 with pgvector instead. Use `DATABASE_URL=postgresql+psycopg://crown:crown@localhost:5432/crown`.

These Postgres steps weren't run on a Mac in this build. The backend tests were run against Postgres 16 with pgvector 0.6.2 on Linux (see [Tests](#tests)).
---

## What's in v1-base

| Area | Screens | Plan phase | Works without a key? |
|---|---|---|---|
| Accounts and privacy | `/`, `/register`, `/login`, `/privacy/receipt`, `/settings`, `/settings/data` | 0 | Yes |
| Onboarding chat with 3 routes | `/start` | 1 | Yes. Typed concerns need AI. |
| Today and Hair Rhythm (install, wear, take down, rest) | `/today` | 1 | Yes |
| Check-ins with rules-based outcomes and pattern alerts | `/check-in/day-3`, `/check-in/weekly` | 1 | Yes. Notes need AI moderation. |
| Wash-day mode: one step per screen, big type, timer | `/wash-day` | 1 | Yes |
| Care plan from templates | `/plan` | 1–2 | Yes. The AI intro is optional. |
| Journal: style ribbon, diary, checks, photo comparison | `/journal`, `/journal/compare` | 1, 3 | Yes |
| Goals and milestones | `/goals` | 1 | Yes. Custom text needs AI moderation. |
| Hair Coach with sources, plus the library | `/ask` | 2 | Library yes, Coach no |
| Crown Map check: zones, questions, optional photos | `/check`, `/map`, `/map/[zone]`, `/take-down` | 3 | Questions-only checks yes; photos no |
| Get checked: reasons, links, care pack PDF, "not now" | `/get-checked` | 4 | Yes |
| Stylist note from ticked lines | `/stylist-note` | 4 | Yes. AI polish is optional. |

Phases 5 and 6 are **not** in this build: products and the ingredient decoder, the style planner and tension map, voice, the hairstyle visualiser, Easy Read, more languages, offline mode and push reminders.


### Look and feel

The screens follow the two UI reference boards: a light grey canvas with white rounded tiles and frosted panels, a soft lime colour for the main action, black round buttons, ring tiles, list rows with an icon and `»`, and a floating tab bar with a black **Check** button in the middle. Headlines use Playfair Display with one italic gold word; everything else uses Manrope. Dark mode, high contrast, map patterns, larger text and the Atkinson Hyperlegible font all still work.

A few things on the boards were changed on purpose:

- **No made-up scores.** The boards show "Hair strength 72%". Crown AI has no validated measure behind a number like that, so the rings only count real things: days into a style, the rhythm stage, zones checked, days until the weekly check-in, and how many zones are Calm, Watch or Get checked.
- **No model photos.** The boards are built around stock photos of models. In their place, Crown AI uses an original drawing: a head seen from above with cornrows (`frontend/components/CrownArt.tsx`), and close-ups of it on the article cards. If you add real photography later, it needs a licence and model releases.
- **No product shelf.** The boards' "Suggested products" row shows library articles here. Products arrive in Phase 5.

The colours are tokens at the top of `frontend/app/globals.css`, in light, dark and high-contrast sets. Text colours are checked for WCAG AA contrast, and the state colours (Calm, Watch, Get checked) always come with a word and a shape.
---

## How it works

```
Browser ──► Next.js (localhost:3000) ──/api/*──► FastAPI (localhost:8000) ──► database: SQLite file locally,
             pages, no secrets          rewrite    accounts, consent,          Postgres + pgvector in production
                                                   rules, AI calls      ──────► photos (backend/var/photos)
                                                                        ──────► OpenAI
```

- **One codebase, two databases.** `DATABASE_URL` picks SQLite or Postgres. The same migration builds both. On Postgres, library search uses pgvector's cosine distance. On SQLite, embeddings are stored as JSON and the same cosine measure is worked out in Python, which is quick for a library this size. Times are stored in UTC on both.
- **Same origin.** The browser only talks to Next.js. `next.config.ts` rewrites `/api/*` to FastAPI, so the session cookie stays first-party and httpOnly. Every write also needs a CSRF token.
- **AI describes; rules decide.** The AI only reports what a photo shows (visible, not visible or can't tell, per sign), and its output schema has no field for a condition. Zone states (Calm, Watch, Get checked, Not checked), check-in outcomes and every "get checked" prompt come from `backend/app/rules/rules_v1.yaml`, which your advisor owns.
- **Answers only from the library.** The Hair Coach and zone explanations can only cite library passages sent with the request. The server rejects any other citation, and a banned-phrase list plus a Decisions check block diagnostic wording. Any failure falls back to fixed template text.
- **Consent is separate and logged.** There are five switches: hair-health records, photo analysis, photo retention, sharing and reminders. Each change is appended to `consent_events` with the wording version. Without photo retention, a photo is described as soon as it's uploaded and is never written to storage. Withdrawing the hair-health switch stops check-ins driving alerts, stylist notes and care packs. Starting a new check discards an unfinished one, and any check can be deleted from the Journal.
- **Photos.** They are shrunk to 1,600 px in the browser. Faces can be blurred on the device (see [Troubleshooting](#troubleshooting)). The server re-encodes each photo with Pillow, which removes EXIF and location data, stores it privately, and only serves it to its owner.
- **Your data.** Settings → Export or delete. Export gives a zip of everything, including kept photos. Delete removes the account, every row and every photo file.

---

## Tests

| What | Command | What it checks |
|---|---|---|
| Backend, 97 tests | `cd backend && uv run pytest` | Rules table and rules-file validation, auth and CSRF, consents and withdrawal, owner-only photos, EXIF removal, photos never stored without retention, deletion, Coach citations and wording guard, care pack, stylist note, advisor routes, the database layer (time zones, cascading deletes, search, the production check), which AI is used and how it's reported, and the real OpenAI client against a local stand-in for the API |
| End to end and accessibility | see below | Every main flow at 390×844, 768×1024 and 1440×900, including a photo upload, with axe WCAG 2.2 AA checks on each page, dark mode and high contrast, and a check that no page is wider than the screen. Any browser console error fails the test, and scroll methods return a Promise as in the newest browsers. |
| Frontend checks | `cd frontend && npm run check` | TypeScript, plus a check that no React effect can return a value (the cause of "destroy is not a function") |
| Hair Coach question set | `cd backend && uv run python -m app.jobs.eval_coach` | Right articles cited, out-of-scope and urgent questions handled, no diagnostic wording. With your key it calls OpenAI, which costs a little. |

The backend tests use Demo AI and never call OpenAI. They create a new SQLite file in a temporary folder each run, so they need no database. To run them against Postgres instead, create an empty database and point `TEST_DATABASE_URL` at it:

```bash
TEST_DATABASE_URL=postgresql+psycopg://YOUR_MAC_USER_NAME@localhost:5432/crown_test uv run pytest
```

**End-to-end tests** expect Demo AI's canned replies, and never spend OpenAI credit. Run them with the backend on Demo AI: either leave `OPENAI_API_KEY` blank, or set `AI_MODE=fake`, then restart the backend. They also need `LIBRARY_INCLUDE_DRAFTS=true`, which is the `.env.example` default. Then:

```bash
cd frontend
npx playwright install chromium   # once
npm run test:e2e
```

What was verified in this build, on Linux with Python 3.13 and Node 22:

- All 97 backend tests pass on SQLite. On Postgres 16 with pgvector 0.6.2, 96 pass and 1 SQLite-only test is skipped.
- Against a local stand-in for the OpenAI API, switching a Demo AI database to `AI_MODE=auto` with a key re-embeds the library at start-up, logs each call, and `ai_calls` lists them. With OpenAI unreachable, the backend stays up and the terminal names the error.
- A fresh copy of this folder, set up by following [Run it](#run-it-about-10-minutes) exactly (in a path with spaces, like yours), starts on SQLite. All 15 end-to-end runs (5 tests × 3 screen sizes) pass against it, with both `npm run dev` and a `next build` production build.

What wasn't tested: nothing was run on a Mac, the `pgvector/pgvector:pg18` image in `docker-compose.yml` wasn't exercised, and the real OpenAI models weren't called (the build environment had no access to api.openai.com). The request and response shapes were checked against the installed `openai` 3.35.1 SDK instead.

---

## Advisor tools

Give an account the advisor role:

```bash
cd backend
uv run python -m app.jobs.make_advisor advisor@example.com
```

From the command line:

```bash
uv run python -m app.jobs.advisor status                       # active rules + each article's review status
uv run python -m app.jobs.advisor review wash-day-basics --reviewer "Dr A. Example" --date 2026-11-01
uv run python -m app.jobs.advisor rules my-rules-v2.yaml        # validates, then activates
```

The same actions are API routes for a signed-in advisor: `POST /api/v1/admin/library`, `PATCH /api/v1/admin/library/{id}`, `PUT /api/v1/admin/rules` and `GET /api/v1/admin/backlog`. The backlog lists Coach questions that had no reviewed answer.

To edit articles, change the Markdown in `content/library/`, then re-run `ingest_library`. Changed text goes back to draft until it is reviewed again.

---

## Before real users

The plan's gates still apply. This build makes the gaps visible rather than hiding them:

- [ ] **Clinical advisor** reviews or replaces `rules_v1.yaml` (`status: reviewed`), every library article, the check-in questions, the zone questions, the care templates and the crisis message in `content/support.yaml`.
- [ ] Set `LIBRARY_INCLUDE_DRAFTS=false`. The server refuses to start with `APP_ENV=production` while it's true, while Demo AI is on, or while the secrets are weak.
- [ ] **Licensed example images** of each sign on darker skin. The zone pages show "Licensed image pending" placeholders. AI-generated images are not acceptable here.
- [ ] **DPIA** and privacy notice. The wording in `content/consents.yaml` is a draft.
- [ ] **Zero Data Retention or Modified Abuse Monitoring** approval from OpenAI.
- [ ] **Regulatory sign-off** on the MHRA position and the zone-state wording.
- [ ] **A labelled photo evaluation** passes the advisor's bar before photo observations reach users (`evals/README.md`).
- [ ] **Production infrastructure:** Postgres with pgvector (the server won't start in production on SQLite), private, encrypted, UK-region object storage for photos (only local disk is built), HTTPS, UK hosting, and a shared store for rate limits if you run more than one API process.

---

## Where this build differs from the plan

- **Visual direction.** The screens follow the reference boards more closely than the plan's Visual direction section does: lime instead of gold for the main action, Playfair Display headlines, frosted panels and ring tiles for real counts. The plan's "states, not scores" rule is kept. See [Look and feel](#look-and-feel).
- **Local database.** Local development uses a SQLite file instead of Postgres in Docker, because Docker isn't allowed on every machine. The plan's Postgres with pgvector is still supported and is required in production.
- **Fifth consent switch.** "Keep my check-ins and hair-health notes" is added to the plan's four, because check-in answers are health data too.
- **Fonts.** They are self-hosted from Fontsource packages with `next/font/local`, not `next/font/google`. Both keep font requests off Google in the browser. This way the build doesn't need to reach Google either.
- **`/plan` page.** It shows the care plan (FR07), which the Pages table didn't list separately.
- **Photo storage.** Only the local-disk backend is built. `STORAGE_BACKEND=s3` isn't implemented yet.
- **Laptop photos.** There's a "continue on your phone" note but no QR code.
- **Rate limits.** The per-minute limit is held in memory. The monthly cap uses the `ai_calls` table.

---

## Troubleshooting

**"database is locked".** Two backends are using the same `backend/var/crown.db`, or a long job is still running. Stop the other process. SQLite lets one writer in at a time, and the backend waits up to 30 seconds before giving up.

**"no such table".** The tables haven't been created yet. From `backend/`, run `uv run alembic upgrade head`, then `uv run python -m app.jobs.ingest_library`.

**Postgres: "permission denied to create extension vector".** Your database user isn't a superuser. Connect as your Mac user (Homebrew and Postgres.app make it a superuser), or run `CREATE EXTENSION vector;` once as a superuser.

**Postgres: "extension "vector" is not available".** pgvector isn't installed for that Postgres. With Homebrew, run `brew install pgvector`. It is built for `postgresql@17` and `postgresql@18`.

**The Coach always says "We don't have a reviewed answer yet".** Check that `LIBRARY_INCLUDE_DRAFTS=true` in development, or mark articles reviewed.

**No OpenAI calls, or the "Demo AI" badge stays on.** Look at the first lines the backend prints when it starts. `Your OPENAI_API_KEY is set but NOT used` means `backend/.env` has `AI_MODE=fake`: change it to `AI_MODE=auto`. Then restart the backend, because it only reads `.env` at start-up. A key exported in your shell (`export OPENAI_API_KEY=...`) also counts, and wins over `.env`.

**"The AI service didn't respond".** The backend terminal shows the failed call and OpenAI's message, for example a wrong key (HTTP 401), a model your account can't use (HTTP 404), or `APIConnectionError` when this computer can't reach api.openai.com (a VPN or company network can block it). Check `OPENAI_API_KEY`, `OPENAI_BASE_URL` and the model names in `backend/.env`.

**The Coach says "We don't have a reviewed answer yet" after switching to OpenAI.** The library has to be re-embedded for OpenAI. The backend does this when it starts in development: look for `Library embedded with ...` or an error just after start-up. You can also run `uv run python -m app.jobs.ingest_library`.

**"useEffect must not return anything" or "destroy is not a function".** Fixed in this version: newer browsers return a Promise from scroll methods, which broke one onboarding effect. `npm run check` now catches the pattern.

**On-device face blur.** It needs MediaPipe's face model, which isn't shipped in this folder. Download it once:

```bash
cd frontend
mkdir -p public/models
curl -L -o public/models/blaze_face_short_range.tflite \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
```

Without the model, the photo step tells people to keep their face out of the frame.

**Testing the camera on a real phone.** Browsers only allow camera capture on secure pages. Run `npx next dev --experimental-https` and open the network address on your phone. Next.js may block development requests from another device unless you add its address to `allowedDevOrigins` in `next.config.ts`.

**Starting again.** Stop the backend and delete `backend/var/` (the SQLite database and any kept photos), then run the `alembic` and `ingest_library` commands again.

---

## Project layout

```
v1-base/
  README.md                 this file
  docker-compose.yml        optional: Postgres 18 + pgvector, where Docker is allowed
  scripts/db-init/          creates crown_test when that container first starts
  content/                  DRAFT advisor-owned content: library articles, check-ins, zones,
                            care templates, consent wording, onboarding script, referrals
  evals/                    Hair Coach question set; photos/ (never committed)
  backend/
    app/main.py             FastAPI app, security headers, production safety check
    app/core/               settings, database, sessions and CSRF, rate limits
    app/api/v1/             routes: account, routine, coach, assessments, sharing, admin
    app/ai/                 openai_client (the only OpenAI caller), fake (Demo AI), moderate,
                            observe (quality gate + vision), explain, coach, guard, text_jobs
    app/rules/              engine.py + rules_v1.yaml (advisor-owned, DRAFT)
    app/prompts/            versioned prompts
    app/services/           Today cards, plans, check-ins, escalation, care pack and stylist note
    app/storage/            photo re-encoding and private local storage
    app/jobs/               ingest_library, ai_calls (recent AI calls), make_advisor, advisor, eval_coach
    alembic/                database migrations (SQLite and Postgres)
    tests/                  pytest suite
    var/                    created on first run: crown.db (SQLite) and photos/
  frontend/
    app/                    pages (route groups: (public) and (app))
    components/             UI kit, crown drawing and Crown Map, rhythm strip, status chips, app shell
    lib/                    API client, types, photo prep and face blur, accessibility settings
    e2e/                    Playwright + axe tests
    next.config.ts          /api rewrite to FastAPI, security headers
    proxy.ts                sends signed-out visitors to /login
```

The build plan this follows is the "Crown AI — Build Plan" document, Phases 0 to 4.
