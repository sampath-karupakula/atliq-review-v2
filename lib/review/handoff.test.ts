import { describe, expect, it } from "vitest";
import { assignWarnings, canFinish, defaultReviewBy, estimateMinutes, hm, markList, markProgress, pushbackFromMarks, questionStatus, type MarkRow } from "./handoff";

const F = [
  { id: "a", severity: "serious", title: "Unlimited liability", dismissed: false },
  { id: "b", severity: "negotiable", title: "75-day payment", dismissed: false },
  { id: "c", severity: "not_sure", title: "Schedule 2 unreadable", dismissed: false },
  { id: "d", severity: "minor", title: "Notices by fax", dismissed: false },
  { id: "e", severity: "serious", title: "Dismissed one", dismissed: true },
];

describe("marking", () => {
  const list = markList(F);
  it("marks Serious, Negotiable and Not sure, not Minor or dismissed", () => {
    expect(list.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("Review done stays off until everything is marked, with notes where needed", () => {
    const some: MarkRow[] = [{ findingId: "a", mark: "agree", note: null }];
    expect(markProgress(list, some)).toEqual({ marked: 1, total: 3, left: 2, missingNotes: 0 });
    expect(canFinish(list, some).ok).toBe(false);
    const all: MarkRow[] = [...some, { findingId: "b", mark: "question", note: "" }, { findingId: "c", mark: "disagree", note: "It's a logo" }];
    expect(canFinish(list, all)).toEqual({ ok: false, why: "1 mark needs a note (why you disagree, or your question)" });
    all[1] = { findingId: "b", mark: "question", note: "Is 45 days enough?" };
    expect(canFinish(list, all).ok).toBe(true);
    expect(canFinish(list, all, [{ addressed: null }, { addressed: "yes" }]).why).toBe("1 of Karandeep's conditions still to check");
    expect(canFinish(list, all, [{ addressed: "no" }]).ok).toBe(true);
  });

  it("agree on Serious and Negotiable makes the pushback list", () => {
    const marks: MarkRow[] = [
      { findingId: "a", mark: "agree", note: null },
      { findingId: "b", mark: "disagree", note: "fine as is" },
      { findingId: "c", mark: "agree", note: null },
    ];
    expect(pushbackFromMarks(list, marks).map((f) => f.id)).toEqual(["a"]);
  });
});

describe("assigning", () => {
  it("suggests two days before the client deadline, never in the past", () => {
    expect(defaultReviewBy("2026-10-16", "2026-09-28")).toBe("2026-10-14");
    expect(defaultReviewBy("2026-09-29", "2026-09-28")).toBe("2026-09-28");
    expect(defaultReviewBy(null, "2026-09-28")).toBe("2026-10-01");
  });

  it("warns about late dates, owners reviewing their own deal and busy reviewers", () => {
    const base = { reviewBy: "2026-10-14", clientDeadline: "2026-10-16", reviewer: "Bhavin", owner: "Karandeep", today: "2026-09-28", openReviews: 1 };
    expect(assignWarnings(base)).toEqual([]);
    expect(assignWarnings({ ...base, reviewBy: "2026-10-20" })[0]).toContain("after the client deadline");
    expect(assignWarnings({ ...base, reviewBy: "2026-09-20" })[0]).toContain("already past");
    expect(assignWarnings({ ...base, owner: "Bhavin" })[0]).toContain("owns this deal");
    expect(assignWarnings({ ...base, openReviews: 4 })[0]).toContain("4 open reviews");
  });
});

describe("review time", () => {
  it("estimates from the document type and Serious items", () => {
    expect(estimateMinutes("msa", 2).est).toBe(150);
    expect(estimateMinutes("nda", 0).est).toBe(15);
    expect(estimateMinutes("other", null).basis).toContain("provisional");
    expect(hm(45)).toBe("45m");
    expect(hm(150)).toBe("2h 30m");
    expect(hm(120)).toBe("2h");
  });
});

describe("counsel questions", () => {
  const today = "2026-10-14";
  it("ranks overdue, due soon, waiting and answered", () => {
    expect(questionStatus({ answerBy: "2026-10-13", answeredOn: null }, today)).toMatchObject({ key: "overdue", label: "Overdue · 1 day" });
    expect(questionStatus({ answerBy: "2026-10-14", answeredOn: null }, today).label).toBe("Due today");
    expect(questionStatus({ answerBy: "2026-10-15", answeredOn: null }, today).label).toBe("Due tomorrow");
    expect(questionStatus({ answerBy: "2026-10-30", answeredOn: null }, today).key).toBe("waiting");
    expect(questionStatus({ answerBy: null, answeredOn: null }, today).label).toBe("Waiting · no date");
    expect(questionStatus({ answerBy: "2026-10-03", answeredOn: "2026-10-04" }, today).label).toBe("Answered 1 day late");
    expect(questionStatus({ answerBy: "2026-10-06", answeredOn: "2026-10-05" }, today).label).toBe("Answered on time");
  });
});

describe("counsel permissions", () => {
  it("only counsel answers; only an admin asks", async () => {
    const { can } = await import("@/lib/auth/permissions");
    expect(can({ name: "Karandeep", role: "admin" }, "counsel.answer")).toBe(false);
    expect(can({ name: "Counsel", role: "viewer" }, "counsel.answer")).toBe(true);
    expect(can({ name: "Bhavin", role: "reviewer" }, "counsel.answer")).toBe(false);
    expect(can({ name: "Karandeep", role: "admin" }, "counsel.ask")).toBe(true);
    expect(can({ name: "Bhavin", role: "reviewer" }, "counsel.ask")).toBe(false);
    expect(can({ name: "Bhavin", role: "reviewer" }, "review.mark", { assignee: "Bhavin" })).toBe(true);
    expect(can({ name: "Dhaval", role: "reviewer" }, "review.mark", { assignee: "Bhavin" })).toBe(false);
  });
});
