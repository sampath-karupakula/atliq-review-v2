import { describe, expect, it } from "vitest";
import { INTERRUPTED_MS, isInterrupted, isStalled, STALL_MS } from "./runState";

const t0 = new Date("2026-10-13T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("background run state", () => {
  it("a runner holding a live lease is never stalled", () => {
    expect(isStalled({ status: "running", leaseUntil: at(60_000), progressAt: t0, startedAt: t0 }, at(STALL_MS + 1000).getTime())).toBe(false);
  });
  it("no lease and no progress for 45 s means stalled", () => {
    expect(isStalled({ status: "running", leaseUntil: null, progressAt: t0, startedAt: t0 }, at(STALL_MS + 1).getTime())).toBe(true);
    expect(isStalled({ status: "running", leaseUntil: at(-1), progressAt: t0, startedAt: t0 }, at(STALL_MS - 1).getTime())).toBe(false);
  });
  it("finished or failed reviews are neither stalled nor interrupted", () => {
    expect(isStalled({ status: "done", leaseUntil: null, progressAt: t0, startedAt: t0 }, at(INTERRUPTED_MS * 2).getTime())).toBe(false);
    expect(isInterrupted({ status: "failed", progressAt: t0, startedAt: t0 }, at(INTERRUPTED_MS * 2).getTime())).toBe(false);
  });
  it("interrupted after 10 minutes without progress", () => {
    expect(isInterrupted({ status: "running", progressAt: null, startedAt: t0 }, at(INTERRUPTED_MS + 1).getTime())).toBe(true);
    expect(isInterrupted({ status: "running", progressAt: at(INTERRUPTED_MS), startedAt: t0 }, at(INTERRUPTED_MS + 1).getTime())).toBe(false);
  });
});
