import { describe, expect, it } from "vitest";
import { commitmentTypeLabel, money, termLabel } from "./format";

describe("format", () => {
  it("shows money in the deal's currency", () => {
    expect(money(210000)).toBe("$210,000");
    expect(money(96000, "EUR")).toBe("€96,000");
    expect(money(5000000, "INR")).toBe("₹50,00,000");
    expect(money(null)).toBe("—");
  });

  it("names register types and baseline terms plainly", () => {
    expect(commitmentTypeLabel("ip_assigned")).toBe("IP assigned");
    expect(termLabel("payment_days")).toBe("Payment days");
  });
});
