# AtliQ Contract Risk Analyzer: Synthetic Test Set

**50 test contracts**, plus 4 edge fixtures, 1 call note and 6 file-format variants. Every document is synthetic: fictional counterparties, written for testing only, not legal advice. AtliQ's own two companies are used as described in the capstone dataset.

## What's here

| Folder or file | Contents |
|---|---|
| `contracts/` | TC01–TC50, one Markdown file each |
| `support/TC44_call_note.md` | Approved call note to attach to TC44 (tests the call-note use case, UC-07) |
| `edge/` | X1–X4: German-language contract, AtliQ not a party, duplicate upload, cover letter only |
| `formats/` | The same content as Word (TC01, TC20, TC33), text PDF (TC12, TC40) and an **image-only scanned PDF** (TC47) |
| `expected_results.json` | Machine-readable answer key: deal details, expected band, must-catch findings (with verbatim quotes), must-not rules, variants |
| `expected_results.md` | The same answer key as a table |
| `generator/` | `templates.py`, `cases.py` and `build.py`, which regenerate everything (`python3 -I build.py`) |

## How the set was designed

1. **One planted problem per contract.** Every client contract starts from AtliQ's clean standard terms:
   - 1× liability cap;
   - mutual indemnity;
   - 0.5% a week penalty, capped at 5%, with client delays excluded;
   - 30-day payment;
   - AtliQ keeps its own tools;
   - the correct company and law.

   Then exactly one thing is changed, so a finding can only come from that change.
2. **Controls that must stay quiet.** TC01–TC05, TC07, TC08, TC14, TC16, TC18 and TC37 test that the tool doesn't cry wolf (principle P7: strict on Serious).
3. **No answers inside the documents.** Nothing in a contract says what was planted. Answers live only in `expected_results.json`.
4. **Quotes are verified.** `build.py` checks that every must-catch quote appears word for word in its document, so the answer key itself is grounded.
5. **Isolated law.** Except in the law tests (TC29–TC31, TC41), counterparties accept AtliQ's standard governing law, so other tests aren't polluted by foreign-law findings.
6. **The register.** It is assumed to be built from the 17 signed contracts in the capstone dataset, all rows confirmed. The clash tests (Group B) depend on Al Noor §12, the Seaside waiver, Crestline §6.4, CloudSpan §7, Northwind §9.2 and Orbit §6.

## How to run a case

1. Upload the file from `contracts/` (or its variant in `formats/`).
2. Enter the deal details from `expected_results.json → cases[i].deal`: value, domain, where the work is delivered from, who touches the data, client deadline.
3. For bundle cases, link the documents listed in `deal.linked`:
   - H1 = TC38 + TC39;
   - E1 = TC41 + TC42;
   - K1 = TC01 + TC43.
4. For TC44, attach `support/TC44_call_note.md` as an approved note.
5. For TC49, upload it as **version 2 of TC23**.
6. Compare the report with `must_catch`, `must_not` and `band`.

**Pass bar for a full run:**
- 100% of must-catch items found;
- 0 must-not items triggered;
- 100% of quotes word for word;
- at least 80% of Serious flags real;
- 0 expired restrictions shown as live;
- every control scored Low.

## The 50 cases

| Group | Cases | What they test |
|---|---|---|
| **A. Controls** | TC01 clean India MSA · TC02 clean US MSA (Inc + US law, rates above Crestline) · TC03 truly mutual NDA · TC04 keyword traps ("unlimited users", "penalty interest" owed by the client, "exclusive sandbox") · TC05 upsell SOW under the signed Sunrise MSA | No false alarms; the upsell path |
| **B. Clashes with past promises** | TC06 Qatar hotels (Al Noor) · TC07 Sri Lanka resorts (no clash) · TC08 Dubai logistics (no clash) · TC09 Seaside follow-on SOW (outside the waiver) · TC10 Bahrain hotel hidden in an annex · TC11 Kuwait serviced apartments (no word "hotel") · TC12 US rates below Crestline · TC13 UK rates below Crestline via Affiliates · TC14 rates above Crestline (no clash) · TC15 competing lakehouse in India/GCC (CloudSpan) · TC16 competing platform, Europe only (no clash) · TC17 PipeKit sole-ownership warranty (Northwind) · TC18 Indian online travel agency (Orbit, expired → history) | Clash check, scope judgement, waivers, Affiliates, expired restrictions |
| **C. One-sided clauses** | TC19 2%/day uncapped penalty · TC20 unlimited liability buried in General · TC21 $500k cap on a $24k retainer · TC22 indemnity for the client's negligence · TC23 no client-delay exclusion · TC24 pre-existing tools assigned · TC25 three bounded issues (90-day payment, 7-day exit, $10M insurance) · TC26 150% cap (Negotiable, not Serious) · TC27 new worldwide logistics non-compete · TC28 exclusivity + best-price demand | Full read, usual-terms comparison, missing protections, deal value, severity calibration |
| **D. Company and law** | TC29 US client with the Indian company · TC30 AtliQ Inc named for a Dubai client while the Indian company invoices, Dubai law · TC31 Brazilian law, Portuguese text prevails · TC32 non-existent "AtliQ Global Solutions LLP" | Company and law check |
| **E. Fairness and NDAs** | TC33 "mutual" NDA binding only AtliQ · TC34 NDA without standard exceptions · TC35 NDA hiding a lender non-compete (clashes with Trustline, PayTrack) · TC36 AtliQ's own unfair agency paper · TC37 AtliQ's own fair agency paper (control) | Fairness both ways, mirror test |
| **F. Bundles and context** | TC38 + TC39 healthcare MSA + BAA banning offshore access · TC40 healthcare MSA with its BAA missing · TC41 + TC42 EU MSA with the data-processing annex missing + an agency with no data clause · TC43 freelancer keeps IP promised to the client (linked to TC01) · TC44 contract differs from the call note | Bundle check, pass-down, delivery check, call-note gaps |
| **G. Guardrails** | TC45 prompt injection · TC46 personal data everywhere (masking) · TC47 OCR-damaged scan · TC48 long contract (60 sections, ~8,900 words), trap in §57, missing Schedule 7 · TC49 revised draft of TC23 · TC50 standalone freelancer (out of scope) | Injection, masking, coverage, no invented values, full re-review, scope gate |

## Coverage map

| What's tested | Cases |
|---|---|
| Clash check against past promises (O3) | TC06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 27, 35 |
| Expired restriction shown as history | TC18 (plus Orbit listed on TC06) |
| Waiver scope | TC09 |
| Usual-terms comparison (A2) | TC19, 22, 24, 25, 26, 34 |
| Missing protections (A3) | TC23, 34, 42 |
| Judged against deal value (O7) | TC19, 21, 25, 45 |
| Company and law (O8) | TC29, 30, 31, 32, 41 |
| Deal bundle (A4) | TC38, 39, 40, 41 |
| Pass-down to subcontractors (O24) | TC42, 43 |
| Delivery and data movement (O25) | TC38, 39, 40, 41 |
| Call note against contract (O17/O18) | TC44 |
| Negotiation history (A5) | TC22 (PayTrack), TC24 (Northwind waved through), TC23 (standard penalty) |
| Fairness, AtliQ as buyer (P4) | TC36, 37 |
| "Mutual" NDA that isn't | TC33 |
| Upsell path (P5) | TC05 |
| Strict on Serious (P7) | TC01–05, 07, 08, 14, 16, 18, 25, 26, 37 |
| Prompt injection (G3) | TC45 |
| Masking and leak check (O21, G2) | TC46 |
| Unreadable text → "Not sure"; coverage (G4) | TC47, 48 |
| No invented values | TC47, 48 |
| Full re-review: New / Resolved / Unchanged (O2) | TC23 → TC49 |
| Scope gate (UC-23) | TC50, X1, X2, X4 |
| Unconfirmed commitment | TC12, variant V1 |
| Duplicate detection | X3 |
| Upload formats (O1) | formats/ (Word, text PDF, scanned PDF) |
| Cost high case | TC48 (~8,900 words) |

## The brief's seven test cases, mirrored

| Brief test case | Dataset file | Synthetic equivalents |
|---|---|---|
| Collides with something already signed | Gulf Crown | TC06, TC09, TC10, TC11, TC12, TC15, TC17 |
| One-sided clause buried in boilerplate | Harrington | TC19, TC20, TC22, TC48 |
| Wrong law or wrong company | TravelHub | TC29, TC30, TC31, TC32 |
| "Mutual" NDA that isn't | FinServe | TC33, TC35 |
| AtliQ's own paper unfair to the other side | Kriti | TC36 (TC37 as control) |
| Healthcare deal with a document missing | Harrington BAA | TC38 + TC39, TC40 |
| Only looks risky | Sunrise SOW-2 | TC04, TC05 |
