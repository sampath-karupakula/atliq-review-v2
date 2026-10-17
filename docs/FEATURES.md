# AtliQ Review: what is built

Status as of October 2026: phases P0–P13 merged, live at <https://atliq-review-v2.vercel.app>. Every item of the
prototype's 37-feature list is built except #37 (call transcripts and chats), which is listed under "Not built yet".

## 1. Upload and intake
- Upload page with a drop zone (Word, PDF, text). The file is read on choose and prefills the client, deal value and
  contract type.
- Deal value in any form (lump sum, rate × days, not stated), client deadline and owner.
- Link to a deal, as a new version of an earlier contract, or as an SOW under an MSA. Assign a reviewer at upload;
  "Start review now" with a cost note.
- Input gate: scanned PDFs, empty files and wrong types stop with a plain message.
- Bulk upload of signed contracts with a coverage meter (admin only), and a card listing the signed contracts not on
  file, shown to everyone.

## 2. The review pipeline
- Mask + leak check → extract terms (AI) → code checks → clash check against the register (AI) → full read of every
  clause (AI) → deal documents (AI) → call-note comparison (AI) → quote verification → severity, score, 3-line
  summary.
- Runs in the background: queue, lease, watchdog, stop and resume.
- Masking before every AI call: names and companies; emails, phones, street addresses (city and postcode kept);
  tax/VAT, company registration, passport and Aadhaar numbers; dates of birth and medical record numbers; IBAN,
  SWIFT, routing and sort codes; URLs, IP addresses, client and PO references. The leak check blocks the call if
  anything slips through. "What the AI saw" tab.
- Injection defence: text in the contract addressed to an AI is reported as a finding, never obeyed.
- Fail closed: a response that fails its schema after one retry stops the review with a plain message.

## 3. The report
- Score card with the severity mix; 3-line summary linking to findings.
- Not sure tray → clashes → Serious (open) → Negotiable (collapsed, with cost) → Minor (folded).
- Each finding: verbatim quote and clause (verified word for word, or "not found after reading all N clauses"), what
  it means, what it could cost, how to soften it, "Our usual" line, suggested wording (copy only), next-step chip.
- Clash box with both quotes, "Open both clauses" and a link to the register row.
- Exposure worked out by code against the deal value.
- Entity and law rules, missing protections, usual terms, "Can we deliver?".
- Calm Low-risk report for clean contracts, with 4 NDA quick tiles.
- Contract text tab with highlights (Original / What the AI saw); Versions tab with a word diff and new / resolved /
  unchanged findings.
- Precedent chips ("How AtliQ handled this before") link to the register row and the signed contract.
- Keyboard shortcuts (j / k / o) and a printable counsel brief.

## 4. Decisions and workflow
- Dismiss with a reason (with Undo); accept a Serious item with a note of 15+ characters (withdrawable).
- Sign lock: no decision while a Serious item is open. Intend to sign / Reject as written (→ Negotiating) / Reject
  for good.
- Stage tracker from facts: Received → AI review → First review → Negotiating → Ready → Decided, with history.
- Negotiation panel: pushback list, copy as email, mark sent, upload the revised version (round 2).
- Quick-decision request to the founder after the first review (withdrawable).
- Edit the client deadline. Deleting a contract needs admin approval: the owner requests with a reason, an admin
  approves or declines.
- Activity log, notifications bell, reminders 30 days ahead.

## 5. Dashboards
- CEO: Decide and First reviews carousels, Assign, Deletion requests, KPIs that link to filtered lists, charts (due
  by week, reviewer workload, Serious flags confirmed), review-time plan.
- Reviewer: KPIs, your first reviews, quick decisions, deals owned, quick offer check, "Take it", track record.
- Counsel: questions waiting.
- Every role: "Review time needed" card. Deadlines timeline, insights, contract lists by company / all open / signed
  with filter chips, search and deadline sort.

## 6. Register (AtliQ's memory)
- Promises with live / expired status computed by code, waivers, confirm, add or correct, link to the signed
  contract.
- Usual terms with strength bars and sources.
- Precedent labels (Standard / Deliberate exception / Waved through / Unclear); only Standard counts as precedent.
- Search past contracts with filters; template fixes; signed-portfolio exposure page.

## 7. Deals and delivery
- Deal pages: document checklist from the deal-type rules, conflicts between documents, data-transfer gate (not
  allowed until the BAA is signed).
- Pass-down table: client terms that must flow to subcontractors, with wording to copy.
- Call notes compared with the next draft (matches / clashes / missing).
- "Can I offer this?": answers as you type from the register, usual terms and rate card.
- Mirror check for AtliQ's own buyer-side paper, with a fair version and template-fix approval.

## 8. Review hand-off
- Assign dialog with warnings (late date, owner reviewing their own deal).
- Marking screen: agree / disagree / question per finding; Review done only when all are marked.
- Second-reviewer prompt on the CEO's own High-risk deals.
- Counsel pack: files, questions, answer-by date; replies show on the report; tracker with nudges.
- Review-time estimates vs actual.

## 9. Accounts and security
- Sign-in, account page, admin user management, lockout and rate limits.
- Server-side permission checks on every action and API route.
- "Viewing as" role switch only with `DEMO_MODE=1`.
- Security headers (CSP, HSTS and more); Next.js 15.5.28.
- Real date in India time; `APP_TODAY` pins it.

## 10. Quality and shipping
- 563 unit tests; CI on every PR (typecheck, lint, tests, no-AI eval gate, migrate + seed, build, smoke test).
- Full evaluation: must-catch 53/56 (95 %), quotes 290/290 verbatim, risk bands 44/50, about $0.10 per review.
- Docker for local development and the production image; Vercel + Neon in production, deployed from `main`.

## Not built yet
- Call transcripts and chats (Slack, WhatsApp) as call notes.
- OCR for scanned contracts.
- Semantic search over past contracts (pgvector).
- Email reminders.

Known gaps: a signed contract's page still offers "Run review"; eval near-misses TC17 (PipeKit clash rated Not sure)
and TC42 (right gap, wrong evidence quote).
