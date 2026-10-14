import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { candidateCommitments, clashFindings, rateCardClash, waiverStatus, type ClashJudgement } from "./register";
import { checkBundle } from "./bundle";
import { diffVersions } from "@/lib/verify/versionDiff";
import { referenceFromSeed } from "@/lib/reference/load";
import type { Extract } from "@/lib/ai/schemas";
import type { DealContext } from "@/lib/reference/types";
import { ROOT, readCorpus } from "@/lib/test-helpers";
import { normaliseText } from "@/lib/ingest/hash";

const ref = referenceFromSeed();
const TODAY = "2026-09-28";

const extract = (over: Partial<Extract> = {}): Extract => ({
  atliq_entity_named: { value: null, clause: null, quote: null },
  invoicing_entity: { value: null, clause: null, quote: null },
  counterparty_country: null,
  governing_law: { law: null, courts: null, clause: null, quote: null },
  language_precedence: { language: null, clause: null, quote: null },
  deal_value: { amount: null, currency: null, clause: null, quote: null },
  rate_card: [], locations: [], terms: [], restrictions: [], referenced_documents: [],
  data: { personal_data: false, phi: false, offshore_restriction: null, clause: null, quote: null },
  not_bound_warranty: { present: false, clause: null, quote: null },
  ai_directed_text: [],
  ...over,
});
const deal = (over: Partial<DealContext> = {}): DealContext => ({
  counterparty: null, valueUsd: 100000, currency: "USD", domain: "analytics", clientCountry: "India", deliveredFrom: "Pune, India",
  dataTouchers: ["AtliQ Pune team"], direction: "atliq_supplier", personalData: null, phi: null, ...over,
});

describe("which commitments to check (O3 candidate filter)", () => {
  it("a Saudi hotel deal pulls in Al Noor (live) and Orbit (expired, related domain)", () => {
    const c = candidateCommitments({ ref, extract: extract(), deal: deal({ domain: "hospitality analytics", clientCountry: "Saudi Arabia" }), docType: "msa", maskedText: "revenue management for nine hotels", today: TODAY });
    expect(c.map((x) => `${x.id}:${x.status}`)).toEqual(expect.arrayContaining(["CMT-001:live", "CMT-005:expired"]));
  });
  it("a rate card pulls in Crestline; a partnership pulls in CloudSpan; tools pull in Northwind", () => {
    const withRates = candidateCommitments({ ref, extract: extract({ rate_card: [{ role: "Senior Data Engineer", rate: 78, clause: "S1.4", quote: "q" }] }), deal: deal(), docType: "msa", maskedText: "", today: TODAY });
    expect(withRates.map((x) => x.id)).toContain("CMT-002");
    expect(candidateCommitments({ ref, extract: extract(), deal: deal(), docType: "partnership", maskedText: "", today: TODAY }).map((x) => x.id)).toContain("CMT-003");
    expect(candidateCommitments({ ref, extract: extract(), deal: deal(), docType: "msa", maskedText: "warrants sole ownership of PipeKit", today: TODAY }).map((x) => x.id)).toContain("CMT-004");
  });
});

describe("clash results (dates, waivers, confirmation in code)", () => {
  const cands = () => candidateCommitments({ ref, extract: extract(), deal: deal({ domain: "hospitality analytics" }), docType: "msa", maskedText: "hotels in Qatar", today: TODAY });
  const yes = (id: string): ClashJudgement => ({ commitment_id: id, applies: "yes", reason: "Hotels in Qatar.", contract_clause: "2.1", contract_quote: "three hotels in Doha, Qatar", scope_match: "Qatar is a GCC state (§12.2)." });

  it("live + yes → serious clash; expired → history, never live (TC06/TC18)", () => {
    const f = clashFindings({ candidates: cands(), judgements: [yes("CMT-001"), yes("CMT-005")], clientHits: [], extract: extract() });
    expect(f.find((x) => x.related?.commitmentId === "CMT-001")).toMatchObject({ check: "clash", severity: "serious", basis: "live_clash" });
    expect(f.find((x) => x.related?.commitmentId === "CMT-005")).toMatchObject({ check: "history", severity: "info" });
  });
  it("the Seaside waiver never covers a new contract (TC09)", () => {
    const w = ref.waivers[0];
    expect(waiverStatus(w).applies).toBe(false);
    const f = clashFindings({ candidates: cands(), judgements: [yes("CMT-001")], clientHits: [], extract: extract() });
    expect(f[0].whatItMeans).toMatch(/does not cover this deal/);
  });
  it("an unconfirmed commitment goes to Not sure (TC12 variant V1)", () => {
    const c = cands().map((x) => (x.id === "CMT-001" ? { ...x, confirmed: false } : x));
    const f = clashFindings({ candidates: c, judgements: [yes("CMT-001")], clientHits: [], extract: extract() });
    expect(f[0]).toMatchObject({ severity: "not_sure", title: expect.stringMatching(/commitment not yet confirmed/) });
  });
  it("a 'not bound by any restriction' warranty becomes serious when a live clash exists (Gulf Crown §9.1(d))", () => {
    const f = clashFindings({
      candidates: cands(), judgements: [yes("CMT-001")], clientHits: [],
      extract: extract({ not_bound_warranty: { present: true, clause: "9.1", quote: "it is not bound by any agreement or restriction" } }),
    });
    expect(f.map((x) => x.category)).toContain("warranty");
  });
});

describe("Crestline best-price check is pure arithmetic (TC12/TC14)", () => {
  const cands = (e: Extract) => candidateCommitments({ ref, extract: e, deal: deal({ clientCountry: "USA" }), docType: "msa", maskedText: "", today: TODAY });
  it("$78 for a Senior Data Engineer is below $85 → serious clash", () => {
    const e = extract({ rate_card: [{ role: "Senior Data Engineer", rate: 78, clause: "Schedule 2, row 1", quote: "| Senior Data Engineer | USD 78 |" }] });
    expect(rateCardClash(e, cands(e))).toEqual([expect.objectContaining({ check: "clash", severity: "serious" })]);
  });
  it("rates above Crestline → no clash", () => {
    const e = extract({ rate_card: [{ role: "Senior Data Engineer", rate: 92, clause: "x", quote: "q" }, { role: "BI Developer", rate: 60, clause: "y", quote: "q" }] });
    expect(rateCardClash(e, cands(e))).toEqual([]);
  });
});

describe("deal bundle rules", () => {
  const baa = normaliseText(readFileSync(path.join(ROOT, "Dataset/incoming/2026-09-16_harrington_health_baa_draft.md"), "utf8"));
  it("Harrington: the BAA keeps PHI in the US but work is delivered from Pune → serious conflict", () => {
    const f = checkBundle({ deal: deal({ clientCountry: "USA", phi: true }), extract: extract({ data: { personal_data: true, phi: true, offshore_restriction: null, clause: null, quote: null } }), docType: "msa", maskedText: "", linked: [{ id: "b", title: "Harrington BAA", docType: "baa", role: "baa", text: baa }] });
    expect(f).toEqual([expect.objectContaining({ check: "bundle_conflict", severity: "serious" })]);
    expect(String(f[0].related?.quoteB)).toMatch(/United States/);
  });
  it("TC40: US healthcare deal with no BAA → serious missing document", () => {
    const f = checkBundle({ deal: deal({ clientCountry: "USA" }), extract: extract({ data: { personal_data: true, phi: true, offshore_restriction: null, clause: "11.1", quote: "protected health information" } }), docType: "msa", maskedText: "", linked: [] });
    expect(f[0]).toMatchObject({ check: "bundle_missing", severity: "serious" });
  });
  it("TC41: German client with personal data and no DPA → serious", () => {
    const f = checkBundle({ deal: deal({ clientCountry: "Germany" }), extract: extract({ data: { personal_data: true, phi: false, offshore_restriction: null, clause: "11.1", quote: "personal data" } }), docType: "msa", maskedText: "", linked: [] });
    expect(f[0]).toMatchObject({ check: "bundle_missing", severity: "serious" });
  });
  it("TC39 on its own: this BAA forbids offshore access → conflict quoted from the document itself", () => {
    const text = normaliseText(readCorpus("contracts/TC39_bayou_valley_health_baa.md"));
    const f = checkBundle({ deal: deal({ clientCountry: "USA", phi: true }), extract: extract(), docType: "baa", maskedText: text, linked: [] });
    expect(f).toEqual([expect.objectContaining({ check: "bundle_conflict", severity: "serious", absent: false })]);
  });
});

describe("version diff (TC23 → TC49)", () => {
  it("tags new / unchanged / resolved and only carries a dismissal when the clause text is unchanged", () => {
    const prev = [
      { key: "a", check: "missing_protection", category: "delay_penalty", clause: "10.2", title: "No client-delay exclusion", clauseText: "10.2 old", dismissed: false },
      { key: "b", check: "baseline", category: "payment", clause: "3.3", title: "60-day payment", clauseText: "3.3 same", dismissed: true, dismissReason: "accepted", dismissedBy: "Karandeep" },
    ];
    const cur = [
      { key: "x", check: "baseline", category: "payment", clause: "3.3", title: "60-day payment", clauseText: "3.3 same" },
      { key: "y", check: "baseline", category: "liability", clause: "9.2", title: "Cap 2×", clauseText: "9.2 new" },
    ];
    const d = diffVersions(prev, cur);
    expect(d.current.map((c) => `${c.key}:${c.versionTag}`)).toEqual(["x:unchanged", "y:new"]);
    expect(d.current[0].carryDismissal).toEqual({ by: "Karandeep", reason: "accepted" });
    expect(d.resolved.map((r) => r.key)).toEqual(["a"]);
  });
});
