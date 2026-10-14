import { describe, expect, it } from "vitest";
import { deadlineWords, filterCounts, filterQueue, type QueueRow } from "./queue";

const TODAY = "2026-09-28";

function row(p: Partial<QueueRow> & { id: string }): QueueRow {
  return {
    title: p.id,
    counterparty: p.id,
    docType: "msa",
    direction: "atliq_supplier",
    companyId: null,
    companyName: null,
    dealId: null,
    owner: null,
    deadline: null,
    deadlineNote: null,
    valueUsd: null,
    currency: "USD",
    reviewState: "not_reviewed",
    band: null,
    score: null,
    seriousOpen: 0,
    liveClash: false,
    topIssue: null,
    reviewer: null,
    reviewDeadline: null,
    decision: null,
    ...p,
  };
}

const rows = [
  row({ id: "gulf", deadline: "2026-10-10", band: "High", seriousOpen: 2, liveClash: true, reviewer: "Bhavin" }),
  row({ id: "harr", deadline: "2026-10-01", band: "High", seriousOpen: 3 }),
  row({ id: "sunrise", deadline: "2026-10-08", band: "Low" }),
  row({ id: "travel", deadline: null }),
  row({ id: "lake", deadline: "2026-10-01", band: "Medium", reviewer: "Jay" }),
];

describe("queue", () => {
  it("sorts by deadline, then risk, with undated contracts last", () => {
    expect(filterQueue(rows, "all", "", TODAY).map((r) => r.id)).toEqual(["harr", "lake", "sunrise", "gulf", "travel"]);
  });

  it("filters to contracts with Serious items still open", () => {
    expect(filterQueue(rows, "serious", "", TODAY).map((r) => r.id)).toEqual(["harr", "gulf"]);
  });

  it("counts every chip from the same rules", () => {
    const c = filterCounts(rows, TODAY);
    expect(c).toMatchObject({ all: 5, week: 2, serious: 2, high: 2, clash: 1, norev: 3 });
  });

  it("searches title, company, owner and reviewer", () => {
    expect(filterQueue(rows, "all", "bhavin", TODAY).map((r) => r.id)).toEqual(["gulf"]);
  });

  it("words deadlines plainly", () => {
    expect(deadlineWords(-2)).toBe("2 days overdue");
    expect(deadlineWords(-1)).toBe("1 day overdue");
    expect(deadlineWords(0)).toBe("today");
    expect(deadlineWords(1)).toBe("tomorrow");
    expect(deadlineWords(12)).toBe("in 12 days");
    expect(deadlineWords(null)).toBe("No date given");
  });
});
