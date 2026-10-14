import { describe, expect, it } from "vitest";
import { companyKey, preferredName } from "./companies";

describe("companyKey merges spellings of one company", () => {
  it.each([
    ["Harrington Health Systems, Inc.", "Harrington Health Systems Inc"],
    ["Sunrise Foods Pvt Ltd", "Sunrise Foods"],
    ["FINSERVE CAPITAL PRIVATE LIMITED", "FinServe Capital Private Limited"],
    ["Gulf Crown Hotels & Resorts Co.", "Gulf Crown Hotels and Resorts"],
    ["TravelHub FZ-LLC", "TravelHub"],
    ["Rheinwerk Analytics GmbH", "Rheinwerk Analytics"],
  ])("%s = %s", (a, b) => expect(companyKey(a)).toBe(companyKey(b)));
  it("keeps different companies apart", () => {
    expect(companyKey("Al Noor Hospitality Group")).not.toBe(companyKey("Gulf Crown Hotels & Resorts Co."));
    expect(companyKey("AtliQ Technologies Pvt Ltd (intercompany)")).toBe("atliq technologies");
  });
  it("shows the most formal spelling", () => {
    expect(preferredName(["Sunrise Foods", "Sunrise Foods Pvt Ltd"])).toBe("Sunrise Foods Pvt Ltd");
    expect(preferredName(["Daniel Ortiz"])).toBe("Daniel Ortiz");
  });
});
