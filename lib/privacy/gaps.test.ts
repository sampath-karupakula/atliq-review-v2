// The masking added for IDs, bank details, personal and health identifiers, web addresses, client references and
// street-level addresses: each kind is masked, round-trips exactly, passes the leak check, and the things the checks
// need (amounts, dates, clause numbers, cities, countries, law) stay visible.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Masker } from "./mask";
import { leakCheck } from "./leakcheck";
import { detectPii, streetPart } from "./patterns";

const SAMPLE = [
  "**Rheinwerk Analytics GmbH**, Leopoldstraße 184, 80804 München, Germany, registered under HRB 241873, VAT ID DE318442907.",
  "Gulf Crown holds Commercial Registration No. 1010584431 and TRN 100234567800003; Northwind is company number 08813527.",
  "The Contractor's passport no. N1234567, Aadhaar 2345 6789 0123, date of birth: 14/03/1988.",
  "Patient Name: Rosa Delgado, MRN: HH-4471923, admitted for review.",
  "Pay to IBAN-free account GB82 WEST 1234 5698 7654 32, SWIFT: HDFCINBBXXX, routing number 021000021, sort code 20-00-00.",
  "Portal: https://portal.harringtonhealth.com/vendors and www.alnoorhospitality.ae; sandbox server IP 192.168.40.12.",
  "Reference HHS-NDA-2026-0412 under PO No. 4500123987 and Invoice # INV-88231.",
  "Client support writes from it@harringtonhealth.com; the portal domain harringtonhealth.com hosts the data room.",
  "Its office is located at 6400 Fannin Street, Suite 1800, Houston, Texas 77030.",
  "Fees are USD 210,000 payable within 45 days; penalties 0.5% a week, capped at 5%. See Clause 4.1.2.3 and Section 12.1.",
  "This Agreement is governed by the laws of Texas; the Medical Records Privacy Act applies. Effective 2026-10-01.",
].join("\n");

describe("masking the new kinds", () => {
  const masker = new Masker({ counterparties: ["Harrington Health Systems, Inc."] });
  const masked = masker.mask(SAMPLE);

  it.each([
    ["EU VAT ID", "DE318442907"],
    ["German trade register", "241873"],
    ["German street", "Leopoldstraße 184"],
    ["Saudi commercial registration", "1010584431"],
    ["UAE TRN", "100234567800003"],
    ["UK company number", "08813527"],
    ["passport", "N1234567"],
    ["Aadhaar", "2345 6789 0123"],
    ["date of birth", "14/03/1988"],
    ["patient name", "Rosa Delgado"],
    ["medical record number", "HH-4471923"],
    ["bare IBAN", "GB82 WEST 1234 5698 7654 32"],
    ["SWIFT", "HDFCINBBXXX"],
    ["routing number", "021000021"],
    ["sort code", "20-00-00"],
    ["URL", "portal.harringtonhealth.com"],
    ["website", "www.alnoorhospitality.ae"],
    ["IP address", "192.168.40.12"],
    ["client reference", "HHS-NDA-2026-0412"],
    ["PO number", "4500123987"],
    ["invoice number", "INV-88231"],
    ["web domain from emails", "harringtonhealth.com"],
    ["street", "6400 Fannin Street, Suite 1800"],
  ])("masks the %s", (_kind, value) => {
    expect(masked).not.toContain(value);
  });

  it("keeps what the checks need visible", () => {
    for (const keep of ["80804 München, Germany", "Houston, Texas 77030", "USD 210,000", "45 days", "0.5%", "5%", "Clause 4.1.2.3", "Section 12.1", "laws of Texas", "Medical Records Privacy Act", "2026-10-01"]) {
      expect(masked).toContain(keep);
    }
  });

  it("passes the leak check and round-trips exactly", () => {
    expect(leakCheck(masked, masker)).toEqual({ ok: true, leaks: [] });
    expect(masker.unmask(masked)).toBe(SAMPLE);
  });

  it("blocks the call when a new kind slips through", () => {
    const report = leakCheck(masked + "\nAlso see VAT ID DE999888777 and HHS-IT-2026-0193.", masker);
    expect(report.ok).toBe(false);
    expect(report.leaks.map((l) => l.detector)).toEqual(expect.arrayContaining(["vat_tax_id", "client_ref"]));
  });
});

describe("street-level addresses", () => {
  it("keeps the city, state, postcode and country", () => {
    expect(streetPart("6400 Fannin Street, Suite 1800, Houston, Texas 77030")).toBe("6400 Fannin Street, Suite 1800");
    expect(streetPart("11th Floor, Orchid Towers, Senapati Bapat Marg, Lower Parel, Mumbai 400013")).toBe("11th Floor, Orchid Towers, Senapati Bapat Marg, Lower Parel");
    expect(streetPart("12 Kings Road, Reading RG1 3AA")).toBe("12 Kings Road");
  });
  it("masks the whole address when it ends in a P.O. Box or has no city", () => {
    expect(streetPart("King Fahd Road, Al Olaya District, P.O. Box 88214")).toBe("King Fahd Road, Al Olaya District, P.O. Box 88214");
    expect(streetPart("Plot 14 400013")).toBe("Plot 14 400013");
  });
});

describe("no false alarms", () => {
  it("ignores clause numbers, amounts, plain dates and reference-free text", () => {
    const text = "Clause 4.1.2.3 caps liability at USD 1,000,000 from 2026-10-01; ISO 27001 and SOC 2 apply. Version 1.2.3.4 of the SOW.";
    expect(detectPii(text)).toEqual([]);
  });
  it("leaves invalid IBAN-shaped strings alone", () => {
    expect(detectPii("Order AB12 CDEF 1234 5678 90").filter((h) => h.detector === "iban_bare")).toEqual([]);
  });
});

describe("across the dataset", () => {
  const COUNTRIES = ["India", "Saudi Arabia", "United Arab Emirates", "UAE", "USA", "United States", "Germany", "United Kingdom", "Singapore", "Oman", "Qatar"];
  const dirs = ["Dataset/incoming", "Dataset/signed_contracts", "test_contracts/contracts"];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => path.join(d, f)));

  it.each(files.map((f) => [f]))("%s: no PII left, countries still visible", (file) => {
    const text = readFileSync(file, "utf8");
    const masker = new Masker({});
    const masked = masker.mask(text);
    expect(leakCheck(masked, masker).ok).toBe(true);
    for (const c of COUNTRIES) {
      if (new RegExp(`\\b${c}\\b`).test(text)) expect(masked, c).toMatch(new RegExp(`\\b${c}\\b`));
    }
  });
});
