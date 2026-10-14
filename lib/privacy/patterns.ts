// PII detectors shared by masking and the leak check (ROADMAP §7.2).
// Keep visible: amounts, percentages, dates, countries, governing law, domain words and AtliQ's own identifiers.

export type PiiKind = "EMAIL" | "PHONE" | "ID" | "ACCOUNT" | "ADDRESS";

export type Detector = { kind: PiiKind; name: string; re: RegExp; group?: number };

export const DETECTORS: Detector[] = [
  { kind: "EMAIL", name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "PHONE", name: "phone_intl", re: /\+\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){2,4}/g },
  { kind: "PHONE", name: "phone_us", re: /\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g },
  { kind: "PHONE", name: "phone_cue", re: /\b(?:tel|telephone|phone|mobile|mob|cell|fax)\.?\s*(?:no\.?)?\s*[:\-]?\s*((?:\+?\d)[\d\s().-]{7,18}\d)/gi, group: 1 },
  { kind: "ID", name: "gstin", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
  { kind: "ID", name: "cin", re: /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g },
  { kind: "ID", name: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: "ID", name: "ifsc", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: "ID", name: "ein", re: /\bEIN[:\s#]*(\d{2}-\d{7})\b/g, group: 1 },
  { kind: "ID", name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "ACCOUNT", name: "iban", re: /\bIBAN[:\s]*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?)/g, group: 1 },
  {
    kind: "ACCOUNT",
    name: "bank_account",
    re: /\b(?:account|a\/c|acct)\.?\s*(?:number|no\.?|#)?\s*[:\-]?\s*(\d[\d -]{7,20}\d)\b/gi,
    group: 1,
  },
  // Personal addresses with no lead-in: "Flat 402, Sai Krupa Residency, Ramdaspeth, Nagpur 440010".
  {
    kind: "ADDRESS",
    name: "flat_address",
    re: /\b(?:Flat|Apartment|Apt\.?|House(?: No\.?)?|H\.\s?No\.?|Bungalow|Villa)\s*[\w/-]+,[^\n()]{3,150}?\b\d{6}\b/g,
  },
  // Addresses after a lead-in, up to a postcode (Indian PIN, US state + ZIP, UK postcode).
  {
    kind: "ADDRESS",
    name: "cued_address",
    re: /\b(?:residing at|resident at|residence at|office at|offices at|place of business at|address(?:ed)? at|located at|address:)\s+([^\n()]{4,180}?(?:\b\d{6}\b|\b[A-Z][a-z]+,?\s+\d{5}(?:-\d{4})?\b|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b))/g,
    group: 1,
  },
];

/** AtliQ's own identifiers and addresses stay visible: they are not personal data and the review needs them. */
export const ATLIQ_ALLOW: RegExp[] = [
  /U72900MH2019PTC321456/,
  /27AAKCA4821F1Z3/,
  /88-4410273/,
  /Baner Business Bay/i,
  /College Road East/i,
];

export function isAllowed(value: string): boolean {
  return ATLIQ_ALLOW.some((re) => re.test(value));
}

export type Hit = { kind: PiiKind; detector: string; value: string; index: number };

export function detectPii(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const d of DETECTORS) {
    for (const m of text.matchAll(d.re)) {
      const value = (d.group ? m[d.group] : m[0])?.trim();
      if (!value || isAllowed(value) || isAllowed(m[0])) continue;
      if (d.name === "bank_account" && value.replace(/\D/g, "").length < 9) continue;
      const index = (m.index ?? 0) + (d.group ? m[0].indexOf(m[d.group]!) : 0);
      hits.push({ kind: d.kind, detector: d.name, value, index });
    }
  }
  return hits;
}
