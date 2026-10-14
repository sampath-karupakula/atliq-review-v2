import { describe, expect, it } from "vitest";
import { capMultiple, money, penaltyMath } from "./dealValue";
import { checkEntityLaw, entityOf, isUS, lawKind } from "./entityLaw";
import { checkTerms, CLIENT_DELAY_EXCLUSION, NOT_SOLE_REMEDY } from "./baseline";
import { decideSeverity } from "@/lib/verify/severity";
import { countSeverities, scoreOf } from "@/lib/score/score";
import type { Extract, ExtractTerm } from "@/lib/ai/schemas";
import type { DealContext } from "@/lib/reference/types";
import type { FindingDraft } from "@/lib/pipeline/types";

const deal = (over: Partial<DealContext> = {}): DealContext => ({
  counterparty: null, valueUsd: 180000, currency: "USD", domain: "insurance analytics", clientCountry: "USA",
  deliveredFrom: "Pune, India", dataTouchers: [], direction: "atliq_supplier", personalData: null, phi: null, ...over,
});

const emptyExtract = (over: Partial<Extract> = {}): Extract => ({
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

const term = (over: Partial<ExtractTerm>): ExtractTerm => ({
  term: "other", burdens: "atliq", rate_pct: null, basis: null, period: null, cap_pct: null, cap_amount: null,
  days: null, amount: null, flags: [], clause: "1.1", quote: "some quoted words", ...over,
});

describe("deal-value arithmetic (G5)", () => {
  it("TC19: 2% of total fees per day on $180,000 → $3,600 a day, full fee in 50 days", () => {
    const m = penaltyMath({ ratePct: 2, period: "day", basis: "total Fees", valueUsd: 180000, capped: false });
    expect(m.perPeriod).toBe(3600);
    expect(m.periodsToFullFee).toBe(50);
    expect(m.text).toBe("$3,600 a day; reaches the full $180,000 fee in 50 days");
  });
  it("Harrington: 2% a day on $210,000 → $4,200 a day", () => {
    expect(penaltyMath({ ratePct: 2, period: "day", basis: "total Fees", valueUsd: 210000, capped: false }).perPeriod).toBe(4200);
  });
  it("TC45: 1% a day on $54,000 → $540 a day, 100 days", () => {
    const m = penaltyMath({ ratePct: 1, period: "day", basis: "total Fees", valueUsd: 54000, capped: false });
    expect(m.text).toBe("$540 a day; reaches the full $54,000 fee in 100 days");
  });
  it("a milestone-based penalty is not multiplied by the whole deal value", () => {
    expect(penaltyMath({ ratePct: 0.5, period: "week", basis: "affected milestone fee", valueUsd: 100000, capped: true }).perPeriod).toBeNull();
  });
  it("TC21: a $500k cap on a $24k retainer is 20.8× the deal", () => {
    expect(capMultiple({ capAmount: 500000, capMultipleOfFees: null, capPct: null, valueUsd: 24000 })!).toBeCloseTo(20.83, 1);
  });
  it("formats money", () => expect(money(1234567)).toBe("$1,234,567"));
});

describe("company and law (O8)", () => {
  it("maps names to companies", () => {
    expect(entityOf("ATLIQ INC.")).toBe("INC");
    expect(entityOf("ATLIQ TECHNOLOGIES PRIVATE LIMITED")).toBe("PVT");
    expect(entityOf("ATLIQ GLOBAL SOLUTIONS LLP")).toBe("UNKNOWN");
    expect(entityOf("Supplier")).toBeNull();
    expect(entityOf("AtliQ")).toBeNull();
  });
  it("recognises US clients and laws", () => {
    expect(isUS("USA")).toBe(true);
    expect(isUS("UAE")).toBe(false);
    expect(lawKind("the laws of the State of Connecticut")).toBe("us");
    expect(lawKind("laws of India")).toBe("india");
    expect(lawKind("the laws of the Emirate of Dubai")).toBe("foreign");
  });
  it("TC29: US client contracting with the Indian company → serious", () => {
    const f = checkEntityLaw({ atliqNames: ["ATLIQ TECHNOLOGIES PRIVATE LIMITED"], extract: emptyExtract(), deal: deal({ clientCountry: "USA" }) });
    expect(f).toEqual([expect.objectContaining({ check: "entity_law", severity: "serious", quote: "ATLIQ TECHNOLOGIES PRIVATE LIMITED" })]);
  });
  it("TC30: Inc named for a Dubai client, Pvt invoicing, Dubai law → serious mismatch + negotiable law", () => {
    const f = checkEntityLaw({
      atliqNames: ["AtliQ Inc"],
      extract: emptyExtract({
        invoicing_entity: { value: "AtliQ Technologies Pvt Ltd", clause: "3.6", quote: "Invoices under this Agreement shall be raised by AtliQ Technologies Pvt Ltd" },
        governing_law: { law: "the laws of the Emirate of Dubai", courts: "Dubai courts", clause: "14.1", quote: "governed by the laws of the Emirate of Dubai" },
      }),
      deal: deal({ clientCountry: "UAE" }),
    });
    expect(f.map((x) => `${x.severity}:${x.clause}`)).toEqual(["serious:3.6", "negotiable:14.1"]);
  });
  it("TC31: correct company, Brazilian law → negotiable only", () => {
    const f = checkEntityLaw({
      atliqNames: ["ATLIQ TECHNOLOGIES PRIVATE LIMITED"],
      extract: emptyExtract({ governing_law: { law: "laws of the Federative Republic of Brazil", courts: null, clause: "14.1", quote: "governed by the laws of the Federative Republic of Brazil" } }),
      deal: deal({ clientCountry: "Brazil" }),
    });
    expect(f.map((x) => x.severity)).toEqual(["negotiable"]);
  });
  it("TC32: an AtliQ name that doesn't exist → serious", () => {
    const f = checkEntityLaw({ atliqNames: ["ATLIQ GLOBAL SOLUTIONS LLP"], extract: emptyExtract(), deal: deal({ clientCountry: "India" }) });
    expect(f[0]).toMatchObject({ severity: "serious", quote: "ATLIQ GLOBAL SOLUTIONS LLP" });
  });
  it("a clean US contract with AtliQ Inc and a US state's law → nothing", () => {
    const f = checkEntityLaw({
      atliqNames: ["ATLIQ INC"],
      extract: emptyExtract({ governing_law: { law: "the State of Delaware", courts: null, clause: "14.1", quote: "laws of the State of Delaware" } }),
      deal: deal(),
    });
    expect(f).toEqual([]);
  });
});

describe("usual terms and missing protections (A2/A3)", () => {
  const sev = (f: FindingDraft[]) => f.map((x) => `${x.check}:${x.severity}`);

  it("AtliQ's standard penalty (0.5%/week, 5% cap, client delay excluded, sole remedy) → nothing", () => {
    const e = emptyExtract({
      terms: [term({ term: "delay_penalty", rate_pct: 0.5, period: "week", basis: "affected milestone fee", cap_pct: 5, flags: ["client_delay_excluded", "sole_remedy"] })],
    });
    expect(checkTerms(e, deal(), "msa")).toEqual([]);
  });
  it("TC19: uncapped 2%/day → serious deal_value", () => {
    const e = emptyExtract({ terms: [term({ term: "delay_penalty", rate_pct: 2, period: "day", basis: "total Fees", flags: ["client_delay_excluded"] })] });
    expect(sev(checkTerms(e, deal(), "msa"))).toEqual(["deal_value:serious"]);
  });
  it("TC23: capped standard penalty without a client-delay exclusion → serious missing protection only", () => {
    const e = emptyExtract({ terms: [term({ term: "delay_penalty", rate_pct: 0.5, period: "week", basis: "milestone fee", cap_pct: 5, flags: ["sole_remedy"] })] });
    expect(sev(checkTerms(e, deal(), "msa"))).toEqual(["missing_protection:serious"]);
  });
  it("the client-delay exclusion is also found by code in the text", () => {
    expect(CLIENT_DELAY_EXCLUSION.test("10.4 No liquidated damages are payable for any delay caused by the Client, its personnel or its other vendors.")).toBe(true);
    expect(NOT_SOLE_REMEDY.test("in addition to the Client's right to recover its actual damages")).toBe(true);
  });
  it("TC26: 150% cap → negotiable, not serious", () => {
    const e = emptyExtract({ terms: [term({ term: "liability_cap", cap_pct: 150, burdens: "both" })] });
    expect(sev(checkTerms(e, deal({ valueUsd: 56000 }), "msa"))).toEqual(["baseline:negotiable"]);
  });
  it("TC21: cap at 20× the deal → serious", () => {
    const e = emptyExtract({ terms: [term({ term: "liability_cap", cap_amount: 500000 })] });
    expect(sev(checkTerms(e, deal({ valueUsd: 24000 }), "msa"))).toEqual(["deal_value:serious"]);
  });
  it("TC20: liability expressly unlimited → serious", () => {
    const e = emptyExtract({ terms: [term({ term: "liability_cap", cap_pct: 100 }), term({ term: "liability_cap", flags: ["unlimited"], clause: "15.9" })] });
    expect(checkTerms(e, deal(), "msa")).toEqual([expect.objectContaining({ severity: "serious", clause: "15.9" })]);
  });
  it("a standard carve-out (fraud, wilful misconduct, paying the fees) is not unlimited liability", () => {
    const e = emptyExtract({
      terms: [term({ term: "liability_cap", flags: ["unlimited"], clause: "9.3", quote: "Sections 9.1 and 9.2 do not limit liability for fraud or wilful misconduct, or the Client's obligation to pay the Fees." })],
    });
    expect(checkTerms(e, deal(), "msa")).toEqual([]);
  });
  it("TC25: 90-day payment, 7-day exit without WIP, $10M insurance → three negotiables", () => {
    const e = emptyExtract({
      terms: [
        term({ term: "payment", days: 90, clause: "3.3" }),
        term({ term: "termination_convenience", days: 7, flags: ["wip_unpaid"], clause: "4.3" }),
        term({ term: "insurance", amount: 10_000_000, clause: "12.1" }),
      ],
    });
    expect(sev(checkTerms(e, deal({ valueUsd: 40000 }), "msa"))).toEqual(["baseline:negotiable", "baseline:negotiable", "deal_value:negotiable"]);
  });
  it("TC22/TC24: client-negligence indemnity and assigned tools → serious", () => {
    const e = emptyExtract({
      terms: [term({ term: "indemnity", flags: ["covers_indemnitee_negligence"] }), term({ term: "ip", flags: ["pre_existing_assigned"] })],
    });
    expect(sev(checkTerms(e, deal(), "msa"))).toEqual(["baseline:serious", "baseline:serious"]);
  });
  it("TC33: one-way 'mutual' NDA → serious fairness; TC34 no exceptions + perpetual → negotiable", () => {
    expect(sev(checkTerms(emptyExtract({ terms: [term({ term: "confidentiality", flags: ["one_way"] })] }), deal(), "nda"))).toEqual(["fairness:serious"]);
    expect(sev(checkTerms(emptyExtract({ terms: [term({ term: "confidentiality", burdens: "both", flags: ["mutual", "no_standard_exceptions", "perpetual"] })] }), deal(), "nda"))).toEqual([
      "missing_protection:negotiable",
      "baseline:negotiable",
    ]);
  });
  it("TC27/TC28: new non-compete and best-price promise → serious; mutual non-solicit → nothing", () => {
    const e = emptyExtract({
      restrictions: [
        { type: "non_compete", binds: "atliq", scope: "logistics analytics", territory: "worldwide", duration: "2 years", binds_affiliates: true, clause: "13.1", quote: "q" },
        { type: "best_price", binds: "atliq", scope: "rates", territory: null, duration: null, binds_affiliates: true, clause: "3.6", quote: "q2" },
        { type: "non_solicit", binds: "both", scope: "staff", territory: null, duration: "12 months", binds_affiliates: false, clause: "13.2", quote: "q3" },
      ],
    });
    expect(sev(checkTerms(e, deal(), "msa"))).toEqual(["full_read:serious", "full_read:serious"]);
  });
  it("TC36: AtliQ as buyer — the mirror test gives fairness/negotiable, never serious", () => {
    const e = emptyExtract({
      terms: [
        term({ term: "delay_penalty", burdens: "counterparty", rate_pct: 2, period: "day", basis: "total fees" }),
        term({ term: "payment", burdens: "counterparty", days: 120, flags: ["pay_when_paid"] }),
        term({ term: "liability_cap", burdens: "counterparty", flags: ["unlimited"] }),
        term({ term: "termination_convenience", burdens: "counterparty", flags: ["wip_unpaid"] }),
      ],
    });
    const f = checkTerms(e, deal({ direction: "atliq_buyer", valueUsd: 7200 }), "subcontract");
    expect(f.every((x) => x.check === "fairness" && x.severity === "negotiable")).toBe(true);
    expect(f).toHaveLength(4);
  });
});

describe("P7 severity and the score", () => {
  const base: FindingDraft = { check: "full_read", category: "liability", severity: "serious", basis: "bounded", title: "t", clause: "9.2", quote: "q", absent: false, whatItMeans: "", whatItCouldCost: "", howToSoften: "", source: "ai" };
  it("serious needs irreversible/unbounded harm", () => {
    expect(decideSeverity(base, true).severity).toBe("negotiable");
    expect(decideSeverity({ ...base, basis: "unbounded" }, true).severity).toBe("serious");
  });
  it("an unverified quote goes to Not sure", () => {
    expect(decideSeverity({ ...base, basis: "unbounded" }, false)).toMatchObject({ severity: "not_sure" });
  });
  it("injection is always reported as Not sure", () => {
    expect(decideSeverity({ ...base, check: "injection", basis: "unbounded" }, true).severity).toBe("not_sure");
  });
  it("score formula, bands and the serious floor", () => {
    expect(scoreOf(countSeverities([]))).toEqual({ score: 0, band: "Low" });
    expect(scoreOf(countSeverities([{ severity: "negotiable" }, { severity: "negotiable" }]))).toEqual({ score: 20, band: "Low" });
    expect(scoreOf(countSeverities([{ severity: "negotiable" }, { severity: "negotiable" }, { severity: "negotiable" }]))).toEqual({ score: 30, band: "Medium" });
    expect(scoreOf(countSeverities([{ severity: "serious" }]))).toEqual({ score: 20, band: "High" });
    expect(scoreOf(countSeverities([{ severity: "serious", dismissed: true }]))).toEqual({ score: 0, band: "Low" });
  });
});
