import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Masker } from "./mask";
import { leakCheck, assertNoLeak, MaskingLeakError } from "./leakcheck";
import { detectPii } from "./patterns";
import { normaliseText } from "@/lib/ingest/hash";
import { expected, readCorpus, ROOT } from "@/lib/test-helpers";

const REGISTER_ORGS = [
  "Al Noor Hospitality Group", "Crestline Retail Inc", "CloudSpan Technologies", "Northwind Logistics", "Orbit Travels",
  "Seaside Hotels LLC", "PayTrack Technologies", "Acme Retail Group", "Sunrise Foods", "Brightwater Insurance Inc",
  "Trustline NBFC", "CareBridge Clinics Inc", "DataNest",
];

describe("TC46: personal data never reaches the AI (G2)", () => {
  const tc46 = expected().cases.find((c) => c.id === "TC46")!;
  const text = normaliseText(readCorpus(tc46.file));
  const masker = new Masker({ counterparties: ["Shree Ganesh Cold Chain Private Limited"], otherOrgs: REGISTER_ORGS });
  const masked = masker.mask(text);

  it.each(tc46.pii_must_not_reach_ai!.map((s) => [s]))("masks %s", (pii) => {
    expect(masked).not.toContain(pii);
  });
  it("passes the leak check", () => {
    expect(leakCheck(masked, masker)).toEqual({ ok: true, leaks: [] });
  });
  it("keeps amounts, dates, governing law and AtliQ's own identifiers visible", () => {
    expect(masked).toContain("U72900MH2019PTC321456");
    expect(masked).toMatch(/India/);
    expect(masked).toMatch(/\d{1,3}(,\d{3})+/); // amounts
  });
  it("unmasks back to the original", () => {
    expect(masker.unmask(masked)).toBe(text);
  });
  it("uses stable labels", () => {
    expect(masked).toMatch(/\bPERSON_\d+\b/);
    expect(masked).toMatch(/\bEMAIL_\d+\b/);
    expect(masked).toMatch(/\bCLIENT_A\b/);
  });
});

describe("masking across the corpus", () => {
  const files = [
    ...readdirSync(path.join(ROOT, "test_contracts/contracts")).map((f) => `test_contracts/contracts/${f}`),
    ...readdirSync(path.join(ROOT, "Dataset/incoming")).map((f) => `Dataset/incoming/${f}`),
    ...readdirSync(path.join(ROOT, "Dataset/signed_contracts")).map((f) => `Dataset/signed_contracts/${f}`),
  ];
  it.each(files.map((f) => [f]))("%s masks cleanly and round-trips", (f) => {
    const text = normaliseText(readFileSync(path.join(ROOT, f), "utf8"));
    const masker = new Masker({ otherOrgs: REGISTER_ORGS });
    const masked = masker.mask(text);
    expect(leakCheck(masked, masker).leaks).toEqual([]);
    expect(masker.unmask(masked)).toBe(text);
    expect(masked).not.toMatch(/Karandeep/);
  });
});

describe("a deal bundle is masked consistently", () => {
  it("TC01 with TC43 linked: names first seen in the linked document are masked in both", async () => {
    const { startReview } = await import("@/lib/pipeline/steps");
    const { referenceFromSeed } = await import("@/lib/reference/load");
    const { Masker: M } = await import("./mask");
    const ref = referenceFromSeed();
    const deal = { counterparty: null, valueUsd: 120000, currency: "USD", domain: "retail analytics", clientCountry: "India", deliveredFrom: "Pune, India", dataTouchers: ["AtliQ Pune team", "Ananya Rao (freelancer)"], direction: "atliq_supplier" as const, personalData: null, phi: null };
    const state = startReview({
      text: normaliseText(readCorpus("contracts/TC01_kaveri_retail_msa.md")), deal, docType: "msa", title: "MSA", atliqNames: [], ref,
      linked: [{ id: "TC43", title: "TC43 FREELANCER", docType: "freelancer", role: "freelancer", text: normaliseText(readCorpus("contracts/TC43_ananya_rao_freelancer_linked.md")) }],
      config: { provider: "anthropic", model: "claude-opus-5-5", apiKey: null, effort: "high", maxInputTokens: 150000 },
    });
    const restored = M.fromKey(state.maskKey, { otherOrgs: REGISTER_ORGS });
    expect(leakCheck(state.maskedText, restored).leaks).toEqual([]);
    expect(leakCheck(state.linked[0].maskedText, restored).leaks).toEqual([]);
    expect(state.linked[0].maskedText).not.toMatch(/Ananya/);
    // Deal details typed on the form are masked too (they go into every prompt's <deal> block).
    expect(state.deal.dataTouchers.join(" ")).not.toMatch(/Ananya/);
    const { extractUser } = await import("@/lib/ai/prompts");
    expect(leakCheck(extractUser(state.deal, state.extractParts[0].text, "1 of 1"), restored).leaks).toEqual([]);
  });
});

describe("leak check blocks the call", () => {
  it("throws when a masked value is still present", () => {
    const masker = new Masker({ people: ["Prakash Deshpande"] });
    masker.mask("Contact Prakash Deshpande.");
    expect(() => assertNoLeak("Contact Prakash Deshpande.", masker)).toThrow(MaskingLeakError);
  });
  it("never puts the leaked value in the error message", () => {
    const masker = new Masker();
    try {
      assertNoLeak("write to a.person@example.com", masker);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("a.person@example.com");
    }
  });
  it("detects Indian identifiers", () => {
    const kinds = detectPii("PAN ABCPD4321K, IFSC HDFC0001234, account number 50100234567812, +91 98220 41736").map((h) => h.detector);
    expect(kinds).toEqual(expect.arrayContaining(["pan", "ifsc", "bank_account", "phone_intl"]));
  });
});
