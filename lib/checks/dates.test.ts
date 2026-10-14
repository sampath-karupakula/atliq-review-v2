import { describe, expect, it } from "vitest";
import { commitmentStatus, daysBetween, deadlineState, formatDate } from "./dates";

const TODAY = "2026-09-28";

describe("commitmentStatus", () => {
  it("Al Noor non-compete is live until 2029-09-14", () => {
    expect(commitmentStatus({ type: "non_compete", ends: "2029-09-14" }, TODAY)).toBe("live");
  });
  it("Orbit non-compete ended 2025-06-30, so it is expired (history)", () => {
    expect(commitmentStatus({ type: "non_compete", ends: "2025-06-30" }, TODAY)).toBe("expired");
  });
  it("Northwind IP assignment with no end is permanent", () => {
    expect(commitmentStatus({ type: "ip_assigned", ends: null }, TODAY)).toBe("permanent");
  });
  it("a commitment ending today is still live", () => {
    expect(commitmentStatus({ type: "best_price", ends: TODAY }, TODAY)).toBe("live");
  });
  it("a commitment that ended yesterday is expired", () => {
    expect(commitmentStatus({ type: "best_price", ends: "2026-09-27" }, TODAY)).toBe("expired");
  });
  it("a non-IP commitment with no end date stays live", () => {
    expect(commitmentStatus({ type: "non_compete", ends: null }, TODAY)).toBe("live");
  });
  it("rejects malformed dates instead of guessing", () => {
    expect(() => commitmentStatus({ type: "non_compete", ends: "14/09/2029" }, TODAY)).toThrow();
  });
});

describe("daysBetween / deadlineState / formatDate", () => {
  it("counts days across a month boundary", () => {
    expect(daysBetween(TODAY, "2026-10-01")).toBe(3);
    expect(daysBetween(TODAY, "2026-09-25")).toBe(-3);
  });
  it("labels deadlines", () => {
    expect(deadlineState("2026-10-01", TODAY)).toMatchObject({ days: 3, tone: "urgent" });
    expect(deadlineState("2026-10-08", TODAY)).toMatchObject({ days: 10, tone: "soon" });
    expect(deadlineState("2026-09-26", TODAY)).toMatchObject({ label: "2d overdue", tone: "overdue" });
  });
  it("formats dates plainly", () => {
    expect(formatDate("2029-09-14")).toBe("14 Sep 2029");
    expect(formatDate(null)).toBe("—");
  });
});
