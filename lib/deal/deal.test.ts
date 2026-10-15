import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildChecklist, dataGate, isComplete, promisesInPlay, type DealDoc, type LivePromise } from "./checklist";
import { checkOffer, overall, type OfferPromise, type OfferTerm } from "@/lib/offer/check";

type SeedCommitment = { id: string; type: string; contract: string; clauses: string[]; territory: string[]; domain: string; activity: string; ends: string | null; reference_rates_usd_per_hour?: Record<string, number>; assets_affected?: string[] };
const reg = JSON.parse(readFileSync("seed/register.json", "utf8")) as { commitments: SeedCommitment[]; waivers: { commitment: string; scope: string }[] };
const TODAY = "2026-09-28";
const status = (c: SeedCommitment) => (!c.ends ? "permanent" : c.ends < TODAY ? "expired" : "live") as OfferPromise["status"];
const waiversOf = (id: string) => reg.waivers.filter((w) => w.commitment === id).map((w) => w.scope);

const live: LivePromise[] = reg.commitments.filter((c) => status(c) !== "expired").map((c) => ({ id: c.id, type: c.type, contract: c.contract, clauses: c.clauses, territory: c.territory, domain: c.domain, ends: c.ends, waiverScopes: waiversOf(c.id) }));
const promises: OfferPromise[] = reg.commitments.map((c) => ({
  id: c.id, type: c.type, contract: c.contract, clauses: c.clauses, territory: c.territory, domain: c.domain, activity: c.activity, ends: c.ends, status: status(c),
  rates: c.reference_rates_usd_per_hour ?? null, assets: c.assets_affected ?? [], waiverScopes: waiversOf(c.id),
}));
const baseline = (JSON.parse(readFileSync("seed/baseline.json", "utf8")) as { terms: { term: string; usual: string; hard_line?: string }[] }).terms;
const terms: OfferTerm[] = baseline.map((t) => ({ term: t.term, usual: t.usual, hardLine: t.hard_line ?? null }));
const cov = { onFile: 17, signedInTracker: 30 };

const doc = (id: string, role: string, docType: string, extra: Partial<DealDoc> = {}): DealDoc => ({ id, role, docType, title: `${docType.toUpperCase()} ${id}`, isSigned: false, band: null, reviewed: false, ...extra });

describe("deal checklist", () => {
  const harrington = { clientCountry: "USA", domain: "healthcare analytics", phi: true, personalData: true };
  const nda = readFileSync("Dataset/signed_contracts/2026-08-20_harrington_health_mutual_nda.md", "utf8");
  const docs = [doc("msa", "client_contract", "msa", { band: "High" }), doc("baa", "baa", "baa"), doc("nda", "nda", "nda", { isSigned: true, text: nda }), doc("ortiz", "freelancer", "freelancer")];

  it("Harrington: SOW missing, BAA unsigned, contractor flow-down to check", () => {
    const items = buildChecklist(harrington, docs, live);
    const by = Object.fromEntries(items.map((i) => [i.key, i.state]));
    expect(by.main).toBe("in_review");
    expect(by.sow).toBe("missing");
    expect(by.nda).toBe("signed");
    expect(by.baa).toBe("draft");
    expect(by["pass-ortiz"]).toBe("check");
    expect(isComplete(items)).toBe(false);
  });

  it("Harrington: data transfer not allowed until the BAA is signed, quoting NDA 2.3", () => {
    const g = dataGate(harrington, docs);
    expect(g.allowed).toBe(false);
    expect(g.quote?.clause).toBe("2.3");
    expect(g.quote?.text).toContain("Business Associate Agreement");
    expect(dataGate(harrington, docs.map((d) => (d.id === "baa" ? { ...d, isSigned: true } : d))).allowed).toBe(true);
  });

  it("Gulf Crown: the live Al Noor promise adds a waiver to the checklist", () => {
    const gc = { clientCountry: "Saudi Arabia", domain: "hospitality analytics", phi: null, personalData: null };
    expect(promisesInPlay(gc, live).map((p) => p.id)).toEqual(["CMT-001"]);
    const items = buildChecklist(gc, [doc("gc", "client_contract", "msa")], live);
    const w = items.find((i) => i.key === "waiver-CMT-001")!;
    expect(w.state).toBe("missing");
    expect(w.note).toContain("Seaside");
    expect(dataGate(gc, []).allowed).toBeNull();
  });

  it("no waiver for hospitality outside the GCC, or for a different field in the GCC", () => {
    expect(promisesInPlay({ clientCountry: "India", domain: "hospitality analytics", phi: null, personalData: null }, live)).toEqual([]);
    expect(promisesInPlay({ clientCountry: "UAE", domain: "travel technology", phi: null, personalData: null }, live)).toEqual([]);
  });

  it("EU client with personal data needs a DPA; an NDA-only deal needs only the NDA", () => {
    const de = { clientCountry: "Germany", domain: "industrial analytics", phi: null, personalData: true };
    expect(buildChecklist(de, [doc("rw", "client_contract", "partnership")], live).find((i) => i.key === "dpa")?.state).toBe("missing");
    expect(dataGate(de, []).allowed).toBe(false);
    const only = buildChecklist({ clientCountry: "India", domain: "retail", phi: null, personalData: null }, [doc("n", "nda", "nda")], live);
    expect(only.map((i) => i.key)).toEqual(["nda"]);
    expect(isComplete(only)).toBe(true);
  });
});

describe("Can I offer this?", () => {
  const ask = (q: string) => checkOffer(q, promises, terms, cov);

  it("$72/hr senior data engineer → Don't offer (Crestline 6.4)", () => {
    const a = ask("$72/hr senior data engineer");
    expect(overall(a)).toBe("stop");
    expect(a[0]!.source).toContain("6.4");
    expect(a[0]!.body).toContain("$85/hr");
  });

  it("rates above the card are fine; a rate between card rates needs the role", () => {
    expect(overall(ask("$95/hr senior data engineer"))).toBe("ok");
    expect(overall(ask("$60 per hour"))).toBe("warn");
    expect(ask("discount for a new client")[0]!.head).toBe("Add the rate");
  });

  it("hotels in Oman → Don't offer (Al Noor), hotels with no country → Check first", () => {
    const a = ask("Hotels in UAE and Oman");
    expect(overall(a)).toBe("stop");
    expect(a[0]!.ruleId).toBe("CMT-001");
    expect(overall(ask("revenue management for a hotel group"))).toBe("warn");
    expect(ask("hotels in India").some((x) => x.verdict === "stop")).toBe(false);
  });

  it("an expired promise is shown as history, not a block", () => {
    const a = ask("online travel booking in India");
    expect(a.some((x) => x.ruleId === "CMT-005" && x.verdict === "ok")).toBe(true);
  });

  it("PipeKit is assigned; IP otherwise means a licence", () => {
    expect(overall(ask("reuse PipeKit for Lakeshore"))).toBe("stop");
    expect(ask("client wants to own the IP")[0]!.head).toBe("Offer a licence, not ownership");
  });

  it("usual terms: payment days, liability, penalties", () => {
    expect(overall(ask("90-day payment terms"))).toBe("stop");
    expect(overall(ask("45 days payment"))).toBe("warn");
    expect(overall(ask("payment in 30 days"))).toBe("ok");
    expect(overall(ask("unlimited liability"))).toBe("stop");
    expect(overall(ask("liability capped at 2x fees"))).toBe("warn");
    expect(overall(ask("penalty 1% per day no cap"))).toBe("stop");
  });

  it("nothing matched says how much was checked", () => {
    const a = ask("weekly status calls");
    expect(a).toHaveLength(1);
    expect(a[0]!.verdict).toBe("ok");
    expect(a[0]!.source).toContain("17 of 30");
    expect(ask("   ")).toEqual([]);
  });
});
