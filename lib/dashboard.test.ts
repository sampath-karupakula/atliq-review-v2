import { describe, expect, it } from "vitest";
import { decideCard, dueByWeek, onTime, reviewsToChase, seriousTrend, toAssign, workload } from "./dashboard";
import type { QueueRow } from "./queue";

const TODAY = "2026-09-28";

function row(p: Partial<QueueRow> & { id: string }): QueueRow {
  return {
    title: p.id,
    counterparty: p.id,
    docType: "msa",
    direction: "atliq_supplier",
    companyId: null,
    companyName: p.id,
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
  row({ id: "gulf", deadline: "2026-10-10", reviewState: "done", band: "High", reviewer: "Bhavin", reviewDeadline: "2026-09-29" }),
  row({ id: "harr", deadline: "2026-10-01", reviewState: "done", band: "High", reviewer: "Dhaval", reviewDeadline: "2026-09-27" }),
  row({ id: "sun", deadline: "2026-10-01", reviewState: "done", band: "Low" }),
  row({ id: "lake", deadline: "2026-10-03" }),
  row({ id: "done", deadline: "2026-09-29", reviewState: "done", band: "High", decision: "sign_intended" }),
  row({ id: "kriti", deadline: "2026-10-15", direction: "atliq_buyer" }),
  row({ id: "travel" }),
];

describe("dashboard", () => {
  it("puts the soonest undecided reviewed contract in the decide card, riskiest on a tie", () => {
    expect(decideCard(rows)?.id).toBe("harr");
  });

  it("chases reviews that are overdue or due tomorrow, most overdue first", () => {
    expect(reviewsToChase(rows, TODAY).map((r) => r.id)).toEqual(["harr", "gulf"]);
  });

  it("lists client contracts with no reviewer, soonest first, undated last", () => {
    expect(toAssign(rows).map((r) => r.id)).toEqual(["sun", "lake", "travel"]);
  });

  it("stacks deadlines by week and band, leaving decided ones out", () => {
    const w = dueByWeek(rows, TODAY);
    expect(w[0]!.label).toBe("28 Sep");
    expect(w[0]!.High).toEqual(["harr"]);
    expect(w[0]!.Low).toEqual(["sun"]);
    expect(w[0]!["Not reviewed"]).toEqual(["lake"]);
    expect(w[1]!.High).toEqual(["gulf"]);
    expect(w[2]!["Not reviewed"]).toEqual(["kriti"]);
  });

  it("counts open first reviews per person, overdue split out, people with none included", () => {
    expect(workload(rows, ["Bhavin", "Dhaval", "Pranav"], TODAY)).toEqual([
      { name: "Bhavin", onTrack: ["gulf"], overdue: [] },
      { name: "Dhaval", onTrack: [], overdue: ["harr"] },
      { name: "Pranav", onTrack: [], overdue: [] },
    ]);
  });

  it("works out the share of Serious flags kept per week, with gaps for empty weeks", () => {
    const t = seriousTrend(
      [
        { raisedOn: "2026-09-27", dismissed: false },
        { raisedOn: "2026-09-26", dismissed: true },
        { raisedOn: "2026-09-24", dismissed: false },
        { raisedOn: "2026-09-10", dismissed: false },
      ],
      TODAY,
      4,
    );
    expect(t.map((x) => x.pct)).toEqual([null, 100, null, 67]);
  });

  it("measures how early a review finished", () => {
    expect(onTime("2026-10-15", "2026-10-13")).toBe(2);
    expect(onTime("2026-10-15", "2026-10-16")).toBe(-1);
  });
});
