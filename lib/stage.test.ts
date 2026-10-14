import { describe, expect, it } from "vitest";
import { pushbackEmail, stageOf, type StageFacts } from "./stage";

const base: StageFacts = {
  review: "done",
  firstReview: "done",
  reviewer: "Bhavin",
  openConditions: 0,
  pushbackItems: 0,
  pushbackSent: false,
  round: 1,
  negotiatedBefore: false,
  decision: null,
  counterparty: "Gulf Crown",
};

describe("stageOf", () => {
  it("follows the contract from upload to decision", () => {
    expect(stageOf({ ...base, review: "none" }).key).toBe("received");
    expect(stageOf({ ...base, review: "running" }).key).toBe("ai");
    expect(stageOf({ ...base, firstReview: "open" }).key).toBe("review");
    expect(stageOf({ ...base, openConditions: 2 }).key).toBe("negotiating");
    expect(stageOf(base).key).toBe("ready");
    expect(stageOf({ ...base, decision: "sign_intended" }).key).toBe("decided");
  });

  it("skips negotiation when there is nothing to push back on", () => {
    expect(stageOf(base).negotiationSkipped).toBe(true);
    expect(stageOf({ ...base, negotiatedBefore: true }).negotiationSkipped).toBe(false);
  });

  it("waits for the counterparty after a pushback is sent, and numbers the round", () => {
    const s = stageOf({ ...base, pushbackSent: true, round: 2 });
    expect(s.key).toBe("negotiating");
    expect(s.label).toBe("Negotiating · round 2 · waiting for Gulf Crown");
    expect(s.next).toContain("round 3");
  });

  it("labels a re-review of a later version", () => {
    expect(stageOf({ ...base, firstReview: "open", round: 3 }).label).toBe("Re-review of v3");
  });

  it("a failed review sends the contract back to Received", () => {
    expect(stageOf({ ...base, review: "failed" }).label).toBe("Received · the last review stopped");
  });
});

describe("pushbackEmail", () => {
  it("lists conditions first, then the findings", () => {
    const t = pushbackEmail({ counterparty: "Gulf Crown", from: "Karandeep", conditions: ["Written waiver from Al Noor"], items: [{ label: "Clause 10.2", ask: "Cap liability at 1× fees" }] });
    expect(t).toContain("1. Written waiver from Al Noor");
    expect(t).toContain("2. Clause 10.2: Cap liability at 1× fees");
    expect(t.endsWith("Karandeep")).toBe(true);
  });
});
