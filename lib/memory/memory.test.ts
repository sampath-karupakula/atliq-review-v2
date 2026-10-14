import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clauseType, normalise, searchClauses, type SearchDoc } from "./search";
import { termStrength } from "./strength";

const DIR = path.join(process.cwd(), "Dataset/signed_contracts");
const docs: SearchDoc[] = readdirSync(DIR).map((file) => ({
  id: file,
  title: file,
  counterparty: file.split("_")[1] ?? file,
  signedDate: file.slice(0, 10),
  inForce: !file.includes("orbit"),
  text: readFileSync(path.join(DIR, file), "utf8"),
}));

describe("searchClauses", () => {
  it("'45 days' finds Trustline 4.2 and Brightwater 7.3", () => {
    const hits = searchClauses(docs, "45 days");
    const found = hits.map((h) => `${h.counterparty} ${h.clause}`);
    expect(found).toContain("trustline 4.2");
    expect(found).toContain("brightwater 7.3");
  });

  it("filters by clause type", () => {
    const hits = searchClauses(docs, "45 days", { type: "payment" });
    expect(hits.every((h) => h.type === "payment")).toBe(true);
    expect(hits.map((h) => h.counterparty)).toEqual(expect.arrayContaining(["trustline", "brightwater"]));
    expect(hits.some((h) => h.counterparty === "sunrise")).toBe(false);
  });

  it("includes expired contracts unless asked not to", () => {
    expect(searchClauses(docs, "travel-booking").some((h) => !h.inForce)).toBe(true);
    expect(searchClauses(docs, "travel-booking", { status: "in_force" }).some((h) => !h.inForce)).toBe(false);
  });

  it("needs every word and ranks an exact phrase first", () => {
    expect(searchClauses(docs, "zebra unicorn")).toEqual([]);
    expect(searchClauses(docs, "   ")).toEqual([]);
    const hits = searchClauses(docs, "liquidated damages");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.exact).toBe(true);
  });

  it("normalises punctuation but keeps decimals", () => {
    expect(normalise("forty-five (45) days'")).toContain(" 45 days ");
    expect(normalise("0.5% per week.")).toBe(" 0.5% per week ");
  });

  it("types a clause by its heading first", () => {
    expect(clauseType("7. FEES AND PAYMENT", "The Customer shall pay within 45 days.")).toBe("payment");
    expect(clauseType(null, "Liquidated damages of 1% per week")).toBe("penalty");
    expect(clauseType(null, "Nothing here")).toBe("other");
  });
});

describe("termStrength", () => {
  it("reads a count across contracts", () => {
    expect(termStrength("9 of 12 contracts", null)).toEqual({ level: 3, label: "In 9 of 12 signed contracts", pct: 75 });
  });
  it("counts past negotiations, ignoring commas in brackets", () => {
    expect(termStrength("Acme (Mar 2025), Northwind (Jun 2025), Trustline (Aug 2026)", null).label).toBe("Agreed in 3 negotiations");
  });
  it("ranks a written rule above one example above nothing", () => {
    expect(termStrength(null, "Checklist: '30 days, 45 max'").level).toBe(3);
    expect(termStrength(null, "PayTrack (Jan 2025)").level).toBe(2);
    expect(termStrength(null, null).level).toBe(0);
  });
});
