import { describe, expect, it } from "vitest";
import { sourceContract, type SignedRef } from "./precedent";

const signed: SignedRef[] = [
  { id: "crest", counterparty: "Crestline Retail Inc", signedDate: "2024-08-01", title: "Crestline Retail — MSA" },
  { id: "noor-nda", counterparty: "Al Noor Hospitality Group", signedDate: "2025-01-22", title: "Al Noor — NDA" },
  { id: "noor-msa", counterparty: "Al Noor Hospitality Group", signedDate: "2025-03-15", title: "Al Noor — MSA" },
  { id: "rohan", counterparty: "Rohan Iyer", signedDate: "2025-04-28", title: "Rohan Iyer — Contractor Agreement" },
  { id: "north", counterparty: "Northwind Logistics", signedDate: "2025-06-20", title: "Northwind — MSA" },
];

describe("sourceContract", () => {
  it("matches a short name to the full legal name", () => {
    expect(sourceContract({ counterparty: "Crestline", date: "2024-07" }, signed)?.id).toBe("crest");
  });

  it("picks the contract closest in date when a company has several", () => {
    expect(sourceContract({ counterparty: "Al Noor", date: "2025-03" }, signed)?.id).toBe("noor-msa");
  });

  it("ignores notes in brackets", () => {
    expect(sourceContract({ counterparty: "Rohan Iyer (freelancer)", date: "2025-04" }, signed)?.id).toBe("rohan");
  });

  it("returns null when no signed contract is on file", () => {
    expect(sourceContract({ counterparty: "GlobalMart", date: "2026-03" }, signed)).toBeNull();
  });

  it("needs a whole-word prefix", () => {
    expect(sourceContract({ counterparty: "North", date: "2025-06" }, signed)).toBeNull();
  });
});
