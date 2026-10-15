import { describe, expect, it } from "vitest";
import { buyerSideSeverity } from "./severity";

describe("buyer-side mirror severity (TC36)", () => {
  it("one-sided core terms on AtliQ's own paper are Negotiable, never Minor or Serious", () => {
    expect(buyerSideSeverity({ check: "fairness", category: "payment", title: "" }, "minor", "atliq_buyer")).toBe("negotiable");
    expect(buyerSideSeverity({ check: "fairness", category: "termination", title: "" }, "minor", "atliq_buyer")).toBe("negotiable");
    expect(buyerSideSeverity({ check: "fairness", category: "liability", title: "" }, "serious", "atliq_buyer")).toBe("negotiable");
    expect(buyerSideSeverity({ check: "fairness", category: "notices", title: "Notices by fax" }, "minor", "atliq_buyer")).toBe("minor");
  });
  it("reads the topic from the title when the AI filed it under 'fairness' (TC36)", () => {
    expect(buyerSideSeverity({ check: "fairness", category: "fairness", title: "Pay-when-paid and payment up to 120 days" }, "minor", "atliq_buyer")).toBe("negotiable");
    expect(buyerSideSeverity({ check: "fairness", category: "fairness", title: "Termination for convenience: work in progress unpaid, 7 days' notice" }, "minor", "atliq_buyer")).toBe("negotiable");
    expect(buyerSideSeverity({ check: "fairness", category: "fairness", title: "Notices only by registered post" }, "minor", "atliq_buyer")).toBe("minor");
  });
  it("a schedule AtliQ's own paper refers to is AtliQ's to supply", () => {
    expect(buyerSideSeverity({ check: "bundle_missing", category: "data", title: "" }, "serious", "atliq_buyer")).toBe("negotiable");
  });
  it("changes nothing when AtliQ is the supplier, or for Not sure", () => {
    expect(buyerSideSeverity({ check: "bundle_missing", category: "data", title: "" }, "serious", "atliq_supplier")).toBe("serious");
    expect(buyerSideSeverity({ check: "fairness", category: "payment", title: "" }, "not_sure", "atliq_buyer")).toBe("not_sure");
  });
});

describe("payment floor (TC25)", () => {
  it("lifts a Minor payment finding past 45 days to Negotiable, from the quote's own numbers", async () => {
    const { paymentFloor } = await import("./severity");
    const f = { category: "payment", title: "Payment terms are 90 days, not 30", quote: "within ninety (90) days of receipt" };
    expect(paymentFloor(f, "minor", "atliq_supplier")).toBe("negotiable");
    expect(paymentFloor({ ...f, quote: "within thirty (30) days of receipt" }, "minor", "atliq_supplier")).toBe("minor");
    expect(paymentFloor(f, "minor", "atliq_buyer")).toBe("minor");
    expect(paymentFloor({ category: "fairness", title: "Payment is 60 days after invoice", quote: "within 60 days" }, "minor", "atliq_supplier")).toBe("negotiable");
  });
});
