# AtliQ Review

AtliQ Review is a contract-risk assistant for AtliQ, a founder-led IT services firm with no in-house lawyer. Upload an
incoming contract and it reads every clause, then checks the contract against what AtliQ has already promised other
clients (the register), AtliQ's usual terms, the deal's value, the rules for which AtliQ company signs and under which
law, and the other documents in the same deal.

It returns a risk score, a three-line summary and findings ordered Serious first. Each finding carries a word-for-word
quote, what it means, what it could cost and how to soften it. Anything it couldn't verify sits in a "Not sure" tray.
It **never signs, approves, sends or edits** a contract: it informs, and the founder decides.

This is the second build, rebuilt from the redesigned prototype phase by phase (`ROADMAP.md`). The first build lives at
[sampath-karupakula/atliq-review](https://github.com/sampath-karupakula/atliq-review); its review pipeline is ported here.

**Live demo:** _the Vercel URL, once the repo owner links the project_

## Run it locally

You need Node 22+, pnpm 10 and Docker.

```bash
pnpm i
cp .env.example .env.local      # fill in the values
docker compose up               # Postgres 16 + the app with hot reload on http://localhost:3000
```

Or run Postgres in Docker and the app on the host:

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

Seed the demo data and accounts once (`SEED_USER_PASSWORD` in `.env.local` sets the password of the six demo
accounts: karandeep@, bhavin@, dhaval@, jay@, pranav@ and counsel@atliq.test):

```bash
pnpm seed           # demo data + accounts; pnpm seed:users adds only the accounts and keeps the data
```

Re-seeding never changes an existing account's password. After changing `SEED_USER_PASSWORD`, set the six demo
accounts to it (this also unlocks them and signs them out):

```bash
pnpm seed:users --reset-passwords
```

### Signing in
With `DEMO_MODE=1` (the default in `.env.example`) nobody needs to sign in: the "Viewing as" switch in the top bar
picks Karandeep (admin), Bhavin (reviewer) or Counsel (read-only), and the sign-in page offers the same choice. A real
sign-in always wins over the switch. Leave `DEMO_MODE` unset on a real deployment: every page, action and API route
then needs an account, five wrong passwords lock an account for 15 minutes, and admins manage people at `/admin/users`.

To try the production image (the same build Vercel runs):

```bash
docker compose --profile prod up --build
```

## Checks

```bash
pnpm check     # typecheck + lint + unit tests
pnpm build
pnpm eval --quick   # 10 cases through the AI pipeline (about USD 1)
```

CI runs the same on every pull request, plus migrations, a production build and a smoke test against a Postgres service.

## Deploy

Production runs on Vercel (Hobby) with Neon Postgres. The repo is connected to Vercel; every merge to `main` deploys.
Set these in the Vercel project: `DATABASE_URL` (the Neon pooled connection string), `APP_TODAY`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and either `DEMO_MODE=1` (a public demo) or `SEED_USER_PASSWORD` with
`SEED_FORCE_PASSWORD_CHANGE=1` (real accounts). Apply migrations with `pnpm db:migrate` from a machine holding the Neon URL.

## How a review works

```
upload ─► input gate ─► mask + leak check ─► AI-1 extract ─► code checks ─► AI-2 clash ─► AI-3 full read
                                                                                              │
          report ◄─ AI-5 summary ◄─ score (P7) ◄─ verify every quote ◄─ AI-6 call notes ◄─ AI-4 bundle
```

- **Input gate** (code): readable text only (scanned PDFs stop with a plain message), English, AtliQ is a party, not a duplicate.
- **Masking** (code): names, emails, phones, tax/company/personal IDs, bank details, web addresses, client references
  and street addresses become labels (`CLIENT_A`, `PERSON_2`, `ID_1` …); cities and countries stay. A leak check
  blocks the AI call if anything slipped through. The key never leaves the server.
- **AI steps** (Claude, structured JSON validated with zod; one retry, then the review fails closed):
  AI-1 extracts facts, AI-2 judges whether a live promise in the register is in scope, AI-3 reads every clause
  against AtliQ's usual terms, AI-4 compares the documents in a deal (pass-down gaps with flow-down wording),
  AI-6 compares call notes with the contract, AI-5 writes the 3-line summary from verified findings only.
- **Code decides**: dates and live/expired, money and exposure maths, entity and governing-law rules, the deal-type
  checklist and data gate, the mirror check's fair versions, severity (Serious needs a verified quote and an
  irreversible, unbounded or live-clash basis) and the score.
- **Every quote is verified word for word** against the original text; anything unverified goes to "Not sure".

## Guardrails
Never signs, sends or edits a contract (suggested wording is copy-only) · mask before every AI call · contract text is
data (AI-directed text is reported as an injection finding) · verbatim quote or Not sure · fail closed · permissions
checked on the server for every page, action and route · deleting a contract needs an admin · daily review cap
(`REVIEWS_PER_DAY`) · security headers and a strict CSP.

## Evaluation

```bash
pnpm eval --gate-only            # input gate, masking and leak checks on every case (no AI, runs in CI)
pnpm eval --quick                # 10 representative cases through the full pipeline
pnpm eval --all                  # all 50 cases in test_contracts/expected_results.json
pnpm eval --cases TC19 --repeat 3   # stability of each must-catch
```

The answer key lists, per case, what must be caught (check, severity, clause, quote) and what must not happen.
Each run prints must-catch, must-not violations, band matches, Serious precision, verified quotes, and its token
use and cost; results are saved in `eval-results/`.

## Cost and limits
- **Cost per review**: about USD 0.10 on Claude Sonnet 5.5 (measured: 10 eval cases, 133k input and 70k output tokens, USD 0.97);
  about USD 0.20 on Opus 5.5. Set the model with `ANTHROPIC_MODEL`.
- **Limits**: scanned or image-only PDFs aren't read (no OCR yet); English contracts only; the clash check only
  knows the signed contracts on file (the coverage line says how many); call notes are typed in, not imported from
  chat or call recordings.

## What's next
OCR for scanned contracts · importing call transcripts and chats (Slack, WhatsApp) as call notes · semantic search
over past contracts (pgvector) · e-mail reminders for review-by and answer-by dates.

## Status

All phases P0–P13 are built (see `ROADMAP.md`). Vercel deployment is linked by the repo owner in the Vercel dashboard.
