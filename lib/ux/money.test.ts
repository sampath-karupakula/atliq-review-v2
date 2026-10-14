import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["140000", 140000, null],
    ["88k", 88000, null],
    ["$140,000", 140000, "USD"],
    ["EUR 88,000", 88000, "EUR"],
    ["1.2m", 1200000, null],
    ["₹50 lakh", 5000000, "INR"],
    ["  £ 12,500 ", 12500, "GBP"],
  ])("%s", (input, value, currency) => {
    expect(parseMoney(input)).toEqual({ value, currency });
  });
  it("rejects text it cannot read", () => {
    expect(parseMoney("about a lot")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});
