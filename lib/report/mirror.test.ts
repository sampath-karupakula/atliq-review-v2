import { describe, expect, it } from "vitest";
import { mirrorItems, type MirrorFinding } from "./mirror";

const f = (p: Partial<MirrorFinding> & { id: string }): MirrorFinding => ({ check: "fairness", category: null, title: p.id, clause: null, quote: null, howToSoften: null, dismissed: false, ...p });
const baseline = [
  { term: "liability_cap", usual: "Capped at 1× total fees, mutual" },
  { term: "payment_days", usual: "30 days from invoice" },
];

describe("mirror check", () => {
  it("lists fairness findings with a fair version and the client-side comparison", () => {
    const items = mirrorItems(
      [
        f({ id: "a", category: "liability", title: "AtliQ's own paper: the vendor's liability is unlimited", clause: "10.2" }),
        f({ id: "b", category: "payment", title: "AtliQ's own paper: pay-when-paid" }),
        f({ id: "c", category: "delay_penalty", dismissed: true }),
        f({ id: "d", check: "baseline", category: "payment" }),
      ],
      baseline,
    );
    expect(items.map((i) => i.findingId)).toEqual(["a", "b"]);
    expect(items[0]!.title).toBe("the vendor's liability is unlimited");
    expect(items[0]!.fairVersion).toContain("capped at the fees paid");
    expect(items[0]!.clientSide).toContain("Capped at 1× total fees");
    expect(items[1]!.fairVersion).toContain("30 days");
  });

  it("falls back to the finding's own advice for an unknown topic", () => {
    expect(mirrorItems([f({ id: "x", category: "warranty", howToSoften: "Shorten the warranty to 90 days." })], baseline)[0]!.fairVersion).toBe("Shorten the warranty to 90 days.");
  });
});
