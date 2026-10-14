import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { splitClauses } from "./clauses";
import { detectDocType, englishRatio, findAtliqNames } from "./doctype";
import { runGate } from "./gate";
import { normaliseText, textHash } from "./hash";
import { expected, readCorpus, ROOT } from "@/lib/test-helpers";

const cases = expected().cases;

describe("clause count matches the answer key for all 50 test contracts", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(splitClauses(normaliseText(readCorpus(c.file))).clauseCount).toBe(c.clauses_numbered);
  });
});

describe("splitClauses segments", () => {
  const tc48 = splitClauses(normaliseText(readCorpus("contracts/TC48_everest_infra_long_msa.md")));
  it("finds deep clauses and schedule items", () => {
    expect(tc48.clauseIds).toContain("57.1");
    expect(tc48.scheduleItemIds).toEqual(expect.arrayContaining(["S1.1", "S1.4", "S3.1", "S6.24"]));
  });
  it("labels table rows by schedule", () => {
    const ids = tc48.segments.filter((s) => s.kind === "table_row").map((s) => s.id);
    expect(ids).toContain("Schedule 2, row 8");
  });
  it("marks OCR-damaged clauses as unreadable (TC47)", () => {
    const tc47 = splitClauses(normaliseText(readCorpus("contracts/TC47_konkan_ports_msa_scanned.md")));
    expect(tc47.unreadable).toEqual(expect.arrayContaining(["10.2", "10.3"]));
  });
  it("handles Harrington's ARTICLE headings and compact clauses", () => {
    const text = normaliseText(readFileSync(path.join(ROOT, "Dataset/incoming/2026-09-10_harrington_health_msa_draft.md"), "utf8"));
    const map = splitClauses(text);
    expect(map.clauseCount).toBeGreaterThan(60);
    expect(map.clauseIds).toContain("1.1");
    expect(map.clauseIds).toContain("1.2");
    expect(map.segments.find((s) => s.id === "1.1")!.text).not.toContain("1.2 ");
  });
});

describe("doc type, AtliQ names, language", () => {
  it("detects types from titles", () => {
    expect(detectDocType(readCorpus("contracts/TC33_saffron_wealth_mutual_nda.md")).docType).toBe("nda");
    expect(detectDocType(readCorpus("contracts/TC50_rahul_menon_freelancer_standalone.md")).docType).toBe("freelancer");
    expect(detectDocType(readCorpus("contracts/TC39_bayou_valley_health_baa.md")).docType).toBe("baa");
    expect(detectDocType(readCorpus("contracts/TC05_sunrise_foods_sow3.md")).docType).toBe("sow");
    expect(detectDocType(readCorpus("contracts/TC36_pixelweave_subcontract_unfair.md")).docType).toBe("subcontract");
    expect(detectDocType(readCorpus("contracts/TC01_kaveri_retail_msa.md")).docType).toBe("msa");
  });
  it("finds the fake AtliQ entity in TC32", () => {
    expect(findAtliqNames(readCorpus("contracts/TC32_lotus_bay_edtech_msa.md")).join(" ")).toMatch(/ATLIQ GLOBAL SOLUTIONS/i);
  });
  it("English ratio separates German from OCR-damaged English", () => {
    expect(englishRatio(readCorpus("edge/X1_german_language_contract.md"))).toBeLessThan(0.08);
    expect(englishRatio(readCorpus("contracts/TC47_konkan_ports_msa_scanned.md"))).toBeGreaterThan(0.12);
  });
});

describe("input gate (G1)", () => {
  const tc01Hash = textHash(readCorpus("contracts/TC01_kaveri_retail_msa.md"));
  const gate = (rel: string, linkedToDeal = false) =>
    runGate({ text: readCorpus(rel), linkedToDeal, findByHash: (h) => (h === tc01Hash ? "tc01-id" : null) });

  it("X1 German → English only", async () => expect(await gate("edge/X1_german_language_contract.md")).toMatchObject({ ok: false, stop: "not_english" }));
  it("X2 → AtliQ not a party", async () => expect(await gate("edge/X2_not_an_atliq_party.md")).toMatchObject({ ok: false, stop: "atliq_not_party" }));
  it("X3 → duplicate of TC01", async () =>
    expect(await gate("edge/X3_duplicate_of_TC01.md")).toMatchObject({ ok: false, stop: "duplicate", duplicateOf: "tc01-id" }));
  it("X4 cover letter → not a contract", async () => expect(await gate("edge/X4_cover_letter_only.md")).toMatchObject({ ok: false, stop: "not_a_contract" }));
  it("TC50 standalone freelancer → out of scope", async () =>
    expect(await gate("contracts/TC50_rahul_menon_freelancer_standalone.md")).toMatchObject({ ok: false, stop: "out_of_scope", docType: "freelancer" }));
  it("TC43 freelancer linked to a deal → allowed", async () =>
    expect(await gate("contracts/TC43_ananya_rao_freelancer_linked.md", true)).toMatchObject({ ok: true, docType: "freelancer" }));
  it("every other test contract passes the gate", async () => {
    const blocked: string[] = [];
    for (const c of cases.filter((c) => c.id !== "TC50" && c.id !== "TC01")) {
      const r = await gate(c.file, Boolean(c.deal.linked?.length));
      if (!r.ok) blocked.push(`${c.id}:${r.stop}`);
    }
    expect(blocked).toEqual([]);
  });
});
