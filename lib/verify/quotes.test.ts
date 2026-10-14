import { describe, expect, it } from "vitest";
import { verifyQuote } from "./quotes";
import { splitClauses } from "@/lib/ingest/clauses";
import { normaliseText } from "@/lib/ingest/hash";
import { expected, readCorpus } from "@/lib/test-helpers";
import { clausesOverlap, parseClauseRef, quotesOverlap } from "@/lib/eval/match";

const cases = expected().cases;
const quoteCases = cases.flatMap((c) =>
  (c.must_catch ?? []).filter((m) => m.quote && m.quote !== "■■■■" ).map((m) => [c.id, c.file, m.quote, m.clause] as const),
);

describe("every answer-key quote verifies against its own document", () => {
  it.each(quoteCases)("%s: %s", (_id, file, quote) => {
    const text = normaliseText(readCorpus(file));
    expect(verifyQuote(text, quote).verified).toBe(true);
  });
});

describe("answer-key quotes survive Word and PDF uploads", () => {
  const ex = expected();
  const variants = ex.format_variants.filter((v) => v.same_as !== "TC47");
  it.each(variants.map((v) => [v.file, v.same_as]))("%s", async (file, sameAs) => {
    const { parseFile } = await import("@/lib/ingest/parse");
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { ROOT } = await import("@/lib/test-helpers");
    const parsed = await parseFile(readFileSync(path.join(ROOT, "test_contracts", file)), file);
    for (const m of ex.cases.find((c) => c.id === sameAs)!.must_catch ?? []) {
      expect(verifyQuote(parsed.text, m.quote).verified, m.quote).toBe(true);
    }
  });
});

describe("verifyQuote", () => {
  const text = 'The Supplier\'s liability shall be  unlimited.\n\n10.2 The penalty is **two percent (2%)** per day — no cap.';
  it("tolerates whitespace, bold and dash/quote styles", () => {
    expect(verifyQuote(text, "two percent (2%) per day - no cap").verified).toBe(true);
    expect(verifyQuote(text, "The Supplier’s liability shall be unlimited").verified).toBe(true);
  });
  it("rejects paraphrases", () => {
    expect(verifyQuote(text, "liability is unlimited").verified).toBe(false);
  });
  it("accepts ellipsis-joined pieces in order only", () => {
    expect(verifyQuote(text, "The Supplier's liability shall be … per day - no cap").verified).toBe(true);
    expect(verifyQuote(text, "per day - no cap … The Supplier's liability shall be").verified).toBe(false);
  });
  it("finds the clause a quote sits in", () => {
    const t = normaliseText(readCorpus("contracts/TC19_granite_peak_insurance_msa.md"));
    const r = verifyQuote(t, "two percent (2%) of the total Fees for each calendar day", splitClauses(t));
    expect(r).toMatchObject({ verified: true, clauseId: "10.2" });
  });
  it("finds quotes in table rows (TC12)", () => {
    const t = normaliseText(readCorpus("contracts/TC12_lakefront_pantry_msa.md"));
    const r = verifyQuote(t, "| Senior Data Engineer | USD 78 |", splitClauses(t));
    expect(r.verified).toBe(true);
  });
});

describe("answer-key clause references", () => {
  it("parses ranges and labels", () => {
    expect([...parseClauseRef("10.2–10.4")]).toEqual(expect.arrayContaining(["10.2", "10.3", "10.4"]));
    expect([...parseClauseRef("Parties; 14.1")]).toEqual(expect.arrayContaining(["parties", "14.1"]));
    expect([...parseClauseRef("2.2 vs BAA 4.1–4.2")]).toEqual(expect.arrayContaining(["2.2", "4.1", "4.2"]));
    expect([...parseClauseRef("Schedule 2, row 8")]).toEqual(expect.arrayContaining(["schedule 2, row 8"]));
    expect([...parseClauseRef("Schedule 1, S1.4")]).toEqual(expect.arrayContaining(["s1.4"]));
    expect([...parseClauseRef("Sections 1.1, 1.2 and 2.1")]).toEqual(expect.arrayContaining(["1.1", "1.2", "2.1"]));
  });
  it("overlaps findings with expectations", () => {
    expect(clausesOverlap("10.2–10.3", "10.3")).toBe(true);
    expect(clausesOverlap("Title", "Title")).toBe(true);
    expect(clausesOverlap("9.2", "10.2")).toBe(false);
  });
  it("quote overlap needs a substantial match", () => {
    expect(quotesOverlap("two percent (2%) of the total Fees", "the Client: two percent (2%) of the total Fees for each day")).toBe(true);
    expect(quotesOverlap("two percent (2%) of the total Fees", "the")).toBe(false);
  });
});
