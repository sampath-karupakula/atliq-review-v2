import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dealMatchKey, inspectContract } from "./inspect";

const read = (f: string) => readFileSync(`Dataset/incoming/${f}`, "utf8");

describe("inspectContract prefills the upload form from the contract", () => {
  it("Gulf Crown: counterparty, country, value, domain", () => {
    const g = inspectContract(read("2026-09-18_gulf_crown_hotels_msa_draft.md"));
    expect(g.counterparty).toBe("Gulf Crown Hotels & Resorts Co.");
    expect(g.clientCountry).toBe("Saudi Arabia");
    expect(g.value).toBe(140000);
    expect(g.currency).toBe("USD");
    expect(g.domain).toMatch(/hospitality/);
    expect(g.direction).toBe("atliq_supplier");
  });
  it("Harrington BAA flags health information", () => {
    const g = inspectContract(read("2026-09-16_harrington_health_baa_draft.md"));
    expect(g.phi).toBe(true);
    expect(g.value).toBeNull();
    expect(g.clientCountry).toBe("USA");
  });
  it("Kriti subcontract: AtliQ is the buyer", () => {
    expect(inspectContract(read("2026-09-26_kriti_data_labs_subcontractor_agreement_draft.md")).direction).toBe("atliq_buyer");
  });
  it("deal match key", () => {
    expect(dealMatchKey("Gulf Crown Hotels & Resorts Co.")).toBe("gulf crown");
  });
});
