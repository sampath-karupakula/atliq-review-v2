import { describe, expect, it } from "vitest";
import { diffParagraphs, diffStats, wordDiff } from "./diff";

describe("diffParagraphs", () => {
  const v1 = "# MSA\n\n10.1 Delivery on time.\n\n10.2 The Supplier pays two percent (2%) per day of delay.\n\n11.1 Old clause removed.";
  const v2 = "# MSA\n\n10.1 Delivery on time.\n\n10.2 The Supplier pays half a percent (0.5%) per week of delay, capped at 5%.\n\n12.1 A new clause.";
  const rows = diffParagraphs(v1, v2);
  it("keeps unchanged paragraphs and finds edits, additions and removals", () => {
    expect(rows.map((r) => r.kind)).toEqual(["same", "same", "change", "del", "add"]);
    expect(diffStats(rows)).toEqual({ changed: 1, added: 1, removed: 1, same: 2 });
  });
  it("marks the changed words inside an edited clause", () => {
    const edit = rows.find((r) => r.kind === "change");
    if (edit?.kind !== "change") throw new Error("no change row");
    expect(edit.left.filter((p) => p.kind === "del").map((p) => p.text.trim())).toEqual(["two", "(2%)", "day", "delay."]);
    expect(edit.right.filter((p) => p.kind === "add").map((p) => p.text.trim()).join(" ")).toContain("capped at 5%");
  });
  it("ignores Markdown bold and whitespace differences", () => {
    expect(diffParagraphs("10.1 The **Supplier**  shall", "10.1 The Supplier shall").map((r) => r.kind)).toEqual(["same"]);
  });
  it("word diff round-trips both texts", () => {
    const { left, right } = wordDiff("a b c d", "a x c d e");
    expect(left.filter((p) => p.kind !== "add").map((p) => p.text).join("")).toBe("a b c d");
    expect(right.filter((p) => p.kind !== "del").map((p) => p.text).join("")).toBe("a x c d e");
  });
});
