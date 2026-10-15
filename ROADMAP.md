# ROADMAP: AtliQ Review v2, phase by phase

Each phase is one branch and one PR (see `CONTRIBUTING.md`). A phase ends at an **approval gate**: summarise what was
built, show the acceptance results below, list what was skipped, and wait for "go".

The design source is the prototype "AtliQ Review Redesign" (screens S1–S9). The logic source is the first build
(`sampath-karupakula/atliq-review`), whose pure modules are ported, not rewritten: `lib/ingest`, `lib/privacy`,
`lib/ai`, `lib/checks`, `lib/verify`, `lib/score`, `lib/pipeline`, `lib/eval`, `lib/ux`, `lib/auth/{permissions,password}`,
plus `seed/*.json`, `Dataset/` and `test_contracts/`.

## Stack
Next.js 15 (App Router) · TypeScript strict · Tailwind 4 with the prototype's tokens · Drizzle + postgres.js ·
Postgres 16 in Docker locally, Neon on Vercel · `@anthropic-ai/sdk` with `output_config` JSON schema + zod ·
mammoth + unpdf · vitest · GitHub Actions CI · Vercel Hobby (functions ≤ 300 s, bodies ≤ 4.5 MB).

The app uses today's real date; `APP_TODAY=2026-09-28` (the dataset's "today") replays the dataset as delivered and is
pinned in CI. The prototype's example dates are illustrative only.

## Phases

Order: every feature that runs without the AI is built first (P9–P11); the AI-dependent pieces wait for P12, then evals and shipping in P13.

| # | Branch | Build | Acceptance at the gate |
|---|---|---|---|
| **P0** | `phase/p00-scaffold` | Repo, Next + TS + Tailwind + ESLint + vitest + Drizzle, docker-compose (db + app) and the production Dockerfile, CI, branch protection, CLAUDE.md / ROADMAP.md / CONTRIBUTING.md / README / .env.example, `/api/health`, hello page | `docker compose up` serves the page on :3000 with the DB connected; CI green on the first PR; the repo linked in Vercel shows the page live on Neon |
| **P1** | `phase/p01-design-shell` | Tokens + fonts from the prototype, app shell: sticky top bar, role nav, "Viewing as" (cookie; demo mode until P11), Ctrl-K palette, toasts with Undo, shortcuts sheet, responsive + dark theme, shared primitives (severity chips, tags, KPI tile, panel, table, dialog, fold) | Screenshot pass at 1240 / 1000 / 375 px in both themes; every nav route renders a stub |
| **P2** | `phase/p02-data-seed` | Schema ported (24 tables) + new: `call_notes`, `precedent_labels`, `counsel_questions`, `second_reviews`, `stage_events`, `reminders`; migrations; `scripts/seed.ts` from `seed/*.json` + `Dataset/` + tracker; read-only Register, Contracts (by company / all open / signed portfolio, deadline sort, filter chips with counts, search), Companies | Register shows CMT-001…005 with live/expired computed (Orbit expired; Al Noor live to 2029-09-14); queue shows the 15 incoming drafts by deadline; coverage "17 of 30" |
| **P3** | `phase/p03-pipeline-port` | Port the pure libs and their tests; `lib/ai` (Opus 5.5 via `ANTHROPIC_MODEL`, Groq fallback), chunking, masking + leak check, checks, verify, severity, score, pipeline steps, `runReview`, `scripts/eval.ts --gate-only`, `ai-ping` | `pnpm test` green (≥ 300 tests); `pnpm eval --gate-only` passes; `pnpm ai:ping` works |
| **P4** | `phase/p04-upload-review-run` | Upload (S7): drop zone, read-on-choose gate + prefill, flexible deal value, deal/version/SOW linking, assign at upload, "Start review now" with cost note, privacy line; bulk signed-contract upload with coverage meter; API routes; background driver (lease, queue, watchdog, stop/resume); progress UI; "What the AI saw" | Upload the TravelHub draft → review completes in the background; TC46 leak check passes; scanned PDF (TC47) stops with a clear message; coverage 17 → 18 after a bulk upload |
| **P5** | `phase/p05-report` | Report (S2): coverage line, 3-line summary, Not sure tray, clash box (both quotes, "Open both clauses", register row), Serious open / Negotiable collapsed with cost / Minor folded, evidence line, exposure tiles, "Our usual", precedent chips, suggested wording (copy only), rule checks, missing protections, usual-terms fold, Can we deliver?; rail: score card, exposure card against the deal value, review time; Contract text tab (highlights, Original / What the AI saw); Versions tab (word diff, new/resolved/unchanged); calm Low-risk report; next-step chip per finding; j/k/o keys | Gulf Crown: Al Noor clash, §9.1(d), "$3,600/day · 50 days", "No ceiling on a $180,000 deal"; Sunrise SOW-2 → calm Low; Harrington: 3 Serious with verified quotes; TC49 as v2 of TC23 shows resolved items |
| **P6** | `phase/p06-decisions-stages` | Dismiss with reason (+Undo), accept Serious with a note (≥ 15 chars, withdraw), sign lock + decision (Intend to sign / Reject as written → Negotiating / Reject for good), stage engine from facts + tracker + history, negotiation panel (pushback list, copy email, mark sent, revised version → round n), activity log, notifications bell, demo reset | Decision locked until both Gulf Crown Serious items are accepted; reject-as-written → Negotiating with conditions in the pushback list; uploading v2 starts round 2 |
| **P7** | `phase/p07-dashboards` | CEO Today (3 cards, KPIs linking to filtered `/contracts`, charts: due by week, workload, Serious-flags-confirmed trend, review-time plan), reviewer dashboard (KPIs, deals-owned stepper, quick offer check, "Take it", track record), counsel dashboard, deadlines timeline, reminders, insights | "Serious items open" → `/contracts?filter=serious` shows only contracts with open Serious items; carousels page; counts match the DB |
| **P8** | `phase/p08-memory` | Register editing (confirm, add/correct, waivers), precedent labels + "Label it", usual-terms page with strength bars, search past contracts (Postgres full-text, filters), signed-portfolio page from `scripts/portfolio.ts`, 13 missing signed contracts as placeholders | Labelling Brightwater "waved through" removes it as a precedent on Gulf Crown; "45 days" search returns Trustline 4.2 and Brightwater 7.3 |
| **P9** | `phase/p09-deals-delivery` | **No AI.** Deals list + deal page: document checklist from the deal-type rules (incl. the Al Noor waiver from the register), conflicts already found by reviews (both quotes), data-transfer gate, people; call notes (added and listed; compared in P12); Can I offer this? (rules over the register, usual terms and rate card, answers as you type, recent checks) + the dashboard quick check | Harrington: bundle incomplete, gate "Not allowed" until the BAA is signed; Gulf Crown needs the Al Noor waiver; "$72/hr senior" → Don't offer (Crestline 6.4); "hotels in Oman" → Don't offer (Al Noor 12.1) |
| **P10** | `phase/p10-review-handoff` | **No AI.** Assign dialog (warnings), marking screen (agree / disagree / question, conditions in re-review, Review done gated), second-reviewer prompt, counsel pack (files, questions, answer-by date), counsel replies, counsel tracker with nudges, review-time estimates vs actual | Marks 9 of 9 → stage moves; a counsel answer shows on the report and the tracker; printable counsel brief |
| **P11** | `phase/p11-auth-roles` | **No AI.** Users/sessions/permissions/password ported; login, account, admin users, lockout, rate limits; "Viewing as" only with `DEMO_MODE=1`; server-side permission matrix on every action and route; CI smoke for signed-out / viewer refused | Counsel can't dismiss or decide (403 on the API too); last admin can't be removed; demo accounts from `SEED_USER_PASSWORD` |
| **P12** | `phase/p12-ai-features` | **Needs Anthropic credit.** The AI pieces held back from P5–P9: pass-down table with flow-down wording (client vs contractor terms), call notes compared with the next version, mirror check for AtliQ-as-buyer with "fair version" + template-fix approval, conflicts between drafts in a deal, `pnpm portfolio` refresh; verify TC49 as v2 of TC23 | Harrington pass-down gaps with copyable wording; a call note "45-day payment" flagged against a 75-day draft; Kriti/PixelCraft paper → 3 "would we accept this?" items; TC49 shows resolved items |
| **P13** | `phase/p13-evals-ship` | `pnpm eval --quick / --all / --dataset / --repeat 3`; fix top failures (prompts first, then rules); daily review cap, security headers, README (architecture, guardrails, cost, limits, next), Vercel production smoke; what's next (OCR, Slack/WhatsApp, pgvector) | Must-catch ≥ 90% (target 100%), 0 must-not on controls, quotes 100% verbatim, controls Low; production URL walks the demo script |

## Feature list → phase
| Feature (from the prototype's list) | Phase |
|---|---|
| 1 Upload with deal value and deadline · 2 full review of every version · 12 privacy shield | P4 |
| 3 score → summary → findings · 4 plain language · 5 evidence · 6 Not sure tray + calm report · 7 exposure vs deal value · 8 entity and law · 9 usual terms · 10 missing protections · 11 NDA quick check + fast track · 30 counter-wording · 34 next step per finding | P5 |
| 13 clash check + register · 15 portfolio scan · 16 coverage meter + bulk upload | P2 / P4 / P5 / P8 |
| 14 precedent labels · 31 search past contracts · 33 reminders | P8 / P7 |
| 17 deal bundle · 19 delivery and data checks · 28 call notes (adding) · 29 Can I offer this? | P9 |
| 18 pass-down · 20 mirror check · 28 call notes (comparison) | P12 |
| 21 sign lock · 26 dismiss with reason · 32 notifications · 35 accepted-risk record | P6 |
| 22 deadline queue and dashboards · 23 Viewing as | P7 / P1 |
| 24 first-review hand-off · 25 second reviewer · 27 counsel pack | P10 |
| 36 login and roles | P11 |
| 37 call transcripts and chats (Slack, WhatsApp) | Not built; listed as next |

## Guardrails (every phase)
Input gate · masking + leak check before every AI call · contract text is data · verbatim quote or Not sure · code does
dates, arithmetic, entity rules and the score · coverage line on every report · strict on Serious · no sign/send/edit
anywhere · permissions checked on the server · fail closed · pinned model via env.
