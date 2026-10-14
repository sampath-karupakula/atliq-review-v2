import { describe, expect, it } from "vitest";
import { exposureHeadline, exposureRows, groupFindings, liveCounts, ndaTiles, nextStep, scoreBand, usualTerms, type ReportFinding } from "./model";

function f(p: Partial<ReportFinding> & { key: string }): ReportFinding {
  return {
    id: p.key,
    check: "full_read",
    category: null,
    severity: "minor",
    title: p.key,
    clause: null,
    quote: null,
    quoteVerified: true,
    absent: false,
    whatItMeans: null,
    whatItCouldCost: null,
    howToSoften: "Soften it",
    versionTag: null,
    dismissed: false,
    dismissedBy: null,
    dismissReason: null,
    accepted: false,
    acceptNote: null,
    source: "code",
    related: {},
    positions: [],
    ...p,
  };
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

describe("report model", () => {
  const list = [
    f({ key: "F1", check: "deal_value", category: "delay_penalty", severity: "serious", clause: "10.2", related: { basis: "unbounded", perPeriod: 3600, periodsToFullFee: 50 } }),
    f({ key: "F2", check: "baseline", category: "liability", severity: "serious", related: { basis: "unbounded" } }),
    f({ key: "F3", check: "clash", severity: "serious", related: { basis: "live_clash" } }),
    f({ key: "F4", check: "baseline", category: "payment", severity: "negotiable", related: { exposureUsd: 8876 } }),
    f({ key: "F5", check: "entity_law", category: "entity", severity: "serious" }),
    f({ key: "F6", check: "delivery", severity: "serious" }),
    f({ key: "F7", severity: "not_sure" }),
    f({ key: "F8", severity: "minor", dismissed: true }),
    f({ key: "F9", severity: "negotiable", versionTag: "resolved" }),
  ];

  it("groups findings into the report's sections", () => {
    const g = groupFindings(list);
    expect(g.serious.map((x) => x.key)).toEqual(["F1", "F2", "F3"]);
    expect(g.clashes.map((x) => x.key)).toEqual(["F3"]);
    expect(g.rules.map((x) => x.key)).toEqual(["F5"]);
    expect(g.delivery.map((x) => x.key)).toEqual(["F6"]);
    expect(g.notSure.map((x) => x.key)).toEqual(["F7"]);
    expect(g.dismissed.map((x) => x.key)).toEqual(["F8"]);
    expect(g.resolved.map((x) => x.key)).toEqual(["F9"]);
  });

  it("scores only what is still open", () => {
    const c = liveCounts(list);
    expect(c).toMatchObject({ serious: 5, negotiable: 1, minor: 0, not_sure: 1 });
    expect(scoreBand(c)).toEqual({ score: 100, band: "High" });
    expect(scoreBand({ serious: 0, negotiable: 0, minor: 2, not_sure: 0, info: 0 })).toEqual({ score: 4, band: "Low" });
  });

  it("prices exposure from code figures only, unlimited first", () => {
    const rows = exposureRows(list);
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["F1", null],
      ["F2", null],
      ["F4", 8876],
    ]);
    expect(rows[0]!.note).toBe("$3,600 a day; the full fee in 50 days");
    expect(exposureHeadline(rows, 180000, usd)).toBe("No ceiling on a $180,000 deal");
    expect(exposureHeadline(rows.slice(2), 180000, usd)).toBe("Up to $8,876: 5% of the deal value");
    expect(exposureHeadline([{ ...rows[2]!, value: 500000 }], 24000, usd)).toBe("Up to $500,000: 20.8× the deal value");
  });

  it("suggests a next step", () => {
    expect(nextStep(list[2]!).kind).toBe("escalate");
    expect(nextStep(f({ key: "x", severity: "serious", related: { basis: "irreversible" } })).kind).toBe("escalate");
    expect(nextStep(list[0]!).kind).toBe("negotiate");
    // A past position labelled Standard never softens a Serious item into "accept".
    expect(nextStep(f({ key: "z", severity: "serious", positions: [{ id: 1, counterparty: "Acme", date: "2025-03", term: "LD", outcome: "no cap", label: "standard", quote: "q" }] })).text).toBe("Negotiate");
    expect(nextStep(list[6]!).kind).toBe("check");
    expect(nextStep(f({ key: "y", severity: "minor" })).kind).toBe("accept");
  });

  it("compares with the usual terms", () => {
    const rows = usualTerms(
      [
        { term: "liability_cap", usual: "1× fees", count: "9 of 12" },
        { term: "payment_days", usual: "30 days", count: null },
        { term: "ip", usual: "AtliQ keeps tools", count: null },
        { term: "buyer_side_terms", usual: "…", count: null },
      ],
      list,
      "msa",
    );
    expect(rows.map((r) => [r.term, r.differs?.key ?? null])).toEqual([
      ["liability_cap", "F2"],
      ["payment_days", "F4"],
      ["ip", null],
    ]);
  });

  it("answers the four NDA questions from the extracted terms", () => {
    const tiles = ndaTiles({
      terms: [{ term: "confidentiality", flags: ["mutual"], days: 730, clause: "7" }],
      restrictions: [{ type: "non_solicit", binds: "atliq", duration: "24 months", clause: "7.3" }],
    })!;
    expect(tiles.map((t) => [t.label, t.value, t.ok])).toEqual([
      ["Mutual?", "Yes", true],
      ["Non-compete", "None", true],
      ["No-hire", "24 months", false],
      ["Duration", "2 years", true],
    ]);
  });
});
