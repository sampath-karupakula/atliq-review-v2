// PII detectors shared by masking and the leak check (ROADMAP §7.2). Every detector here is also a leak-check rule:
// anything it still finds in masked text blocks the AI call.
// Keep visible: amounts, percentages, dates (except dates of birth), countries, cities, governing law, domain words,
// third-party product names and AtliQ's own identifiers.

export type PiiKind = "EMAIL" | "PHONE" | "ID" | "ACCOUNT" | "ADDRESS" | "URL" | "REF";

export type Detector = { kind: PiiKind; name: string; re: RegExp; group?: number };

export const DETECTORS: Detector[] = [
  { kind: "EMAIL", name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "PHONE", name: "phone_intl", re: /\+\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){2,4}/g },
  { kind: "PHONE", name: "phone_us", re: /\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g },
  { kind: "PHONE", name: "phone_cue", re: /\b(?:tel|telephone|phone|mobile|mob|cell|fax)\.?\s*(?:no\.?)?\s*[:\-]?\s*((?:\+?\d)[\d\s().-]{7,18}\d)/gi, group: 1 },

  // Tax and company identifiers.
  { kind: "ID", name: "gstin", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
  { kind: "ID", name: "cin", re: /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g },
  { kind: "ID", name: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: "ID", name: "ifsc", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: "ID", name: "ein", re: /\bEIN[:\s#]*(\d{2}-\d{7})\b/g, group: 1 },
  { kind: "ID", name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // EU VAT IDs ("VAT ID DE318442907"), UAE TRNs (15 digits), other tax numbers after a cue.
  { kind: "ID", name: "vat_tax_id", re: /\b(?:VAT|USt-?IdNr\.?|TRN|Tax Registration(?: Number| No\.?)?|Tax ID|TIN)\s*(?:ID|No\.?|Number|#)?\s*[:#]?\s*([A-Z]{2}\s?[0-9A-Z]{8,12}|\d{9,15})\b/g, group: 1 },
  // Company registrations: Saudi "Commercial Registration No. 1010584431", UK "company number 08813527".
  { kind: "ID", name: "company_reg", re: /\b(?:Commercial Registration|CR|[Cc]ompany|[Rr]egistered|[Rr]egistration)\s+(?:No\.?|Number|number|no\.?)\s*[:.]?\s*([A-Z]{0,2}\d{6,12})\b/g, group: 1 },
  // German commercial register: "under HRB 241873".
  { kind: "ID", name: "trade_register", re: /\b(?:HRB|HRA)\s*(\d{3,7})\b/g, group: 1 },

  // Personal identifiers (freelancer and contractor agreements, healthcare deals).
  { kind: "ID", name: "passport", re: /\b[Pp]assport\s*(?:[Nn]o\.?|[Nn]umber|#)?\s*[:\-]?\s*([A-Z0-9]{6,9})\b/g, group: 1 },
  { kind: "ID", name: "aadhaar", re: /\b(?:Aadhaar|Aadhar|UID)\s*(?:[Nn]o\.?|[Nn]umber|#)?\s*[:\-]?\s*(\d{4}\s?\d{4}\s?\d{4})\b|\b\d{4}\s\d{4}\s\d{4}\b/g },
  {
    kind: "ID",
    name: "date_of_birth",
    re: /\b(?:[Dd]ate of [Bb]irth|DOB|[Bb]orn on)\s*[:\-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+,?\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/g,
    group: 1,
  },
  { kind: "ID", name: "medical_record", re: /\b(?:MRN|[Mm]edical [Rr]ecord (?:[Nn]umber|[Nn]o\.?)|[Pp]atient (?:ID|[Nn]umber|[Nn]o\.?))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9-]{4,14})\b/g, group: 1 },

  // Bank details.
  { kind: "ACCOUNT", name: "iban", re: /\bIBAN[:\s]*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?)/g, group: 1 },
  // An IBAN with no label; kept only when its mod-97 checksum is valid, so reference numbers aren't caught.
  { kind: "ACCOUNT", name: "iban_bare", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g },
  { kind: "ACCOUNT", name: "swift_bic", re: /\b(?:SWIFT|BIC)(?:\s*\/\s*BIC)?(?:\s*[Cc]ode)?\s*[:\-]?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g, group: 1 },
  { kind: "ACCOUNT", name: "routing", re: /\b(?:[Rr]outing|ABA)\s*(?:[Nn]umber|[Nn]o\.?|#)?\s*[:\-]?\s*(\d{9})\b/g, group: 1 },
  { kind: "ACCOUNT", name: "sort_code", re: /\b[Ss]ort [Cc]ode\s*[:\-]?\s*(\d{2}-\d{2}-\d{2})\b/g, group: 1 },
  {
    kind: "ACCOUNT",
    name: "bank_account",
    re: /\b(?:account|a\/c|acct)\.?\s*(?:number|no\.?|#)?\s*[:\-]?\s*(\d[\d -]{7,20}\d)\b/gi,
    group: 1,
  },

  // Web addresses name the client as plainly as its name does; so do IP addresses of its systems.
  { kind: "URL", name: "url", re: /\b(?:https?:\/\/[^\s)>\]"'*]+|www\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s)>\]"'*]*)?)/g },
  { kind: "URL", name: "ipv4", re: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },

  // The client's own reference numbers encode its initials ("HHS-NDA-2026-0412", "RWA-2026-014"); so do PO numbers.
  { kind: "REF", name: "client_ref", re: /\b[A-Z]{2,6}(?:-[A-Z]{2,5})?-(?:19|20)\d{2}-\d{2,5}\b/g },
  { kind: "REF", name: "po_invoice", re: /\b(?:PO|Purchase Order|Invoice)\s*(?:No\.?|Number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{3,})/g, group: 1 },

  // European street before "postcode city" with no lead-in: "Leopoldstraße 184, 80804 München" (street only).
  {
    kind: "ADDRESS",
    name: "eu_street",
    re: /\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|platz|allee|gasse|ring|damm)\s+\d{1,4}[a-z]?(?=,\s*\d{4,5}\s+[A-ZÄÖÜ])/g,
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
  /^ATQ-/, // AtliQ's own contract references
  /atliq/i, // AtliQ's website and email domains
];

export function isAllowed(value: string): boolean {
  return ATLIQ_ALLOW.some((re) => re.test(value));
}

const US_STATES =
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";
const POSTCODE = /\s*(?:\b\d{6}\b|\b\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b)\s*$/;
const STATE_ONLY = new RegExp(`^(?:${US_STATES})$`);

/**
 * The street-level part of an address, so the city, state, country and postcode stay visible: territory and
 * entity/law checks need them, and they don't identify anyone. "6400 Fannin Street, Suite 1800, Houston, Texas 77030"
 * → "6400 Fannin Street, Suite 1800". An address that ends in a P.O. Box, or has no recognisable city, is masked whole.
 */
export function streetPart(address: string): string {
  const parts = address.split(/,\s*/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length < 2 || /^P\.?\s?O\.?\s+Box\b/i.test(last)) return address;
  const lastText = last.replace(POSTCODE, "").trim();
  if (!lastText || !POSTCODE.test(last) || /\d/.test(lastText)) return address;
  // "Houston, Texas 77030": the state ends the address, so the city before it stays visible too.
  const keep = STATE_ONLY.test(lastText) && parts.length >= 3 ? 2 : 1;
  const street = parts.slice(0, parts.length - keep).join(", ");
  return street.length >= 4 ? street : address;
}

/** mod-97 check for an IBAN written without its label. */
function validIban(value: string): boolean {
  const s = value.replace(/\s/g, "");
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of n) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const ONLY_TOKENS = /^(?:\s|,|\b(?:CLIENT|PARTY)_[A-Z]{1,2}(?:_\d+)?\b|\b(?:PERSON|EMAIL|PHONE|ID|ACCOUNT|ADDRESS|URL|REF)_\d+(?:_\d+)?\b)+$/;
// Values that must carry a digit to count (passport and PO numbers, medical record numbers).
const NEEDS_DIGIT = new Set(["passport", "po_invoice", "medical_record"]);

export type Hit = { kind: PiiKind; detector: string; value: string; index: number };

export function detectPii(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const d of DETECTORS) {
    for (const m of text.matchAll(d.re)) {
      const raw = (d.group ? (m[d.group] ?? m[0]) : m[0])?.trim();
      if (!raw || isAllowed(raw) || isAllowed(m[0])) continue;
      if (d.name === "bank_account" && raw.replace(/\D/g, "").length < 9) continue;
      if (d.name === "iban_bare" && !validIban(raw)) continue;
      if (NEEDS_DIGIT.has(d.name) && !/\d/.test(raw)) continue;
      // "4.1.2.3" is a clause number, not a server: a bare IP needs an "IP/server/host" cue or a part above 31.
      if (d.name === "ipv4" && !/(?:IP|server|host)[^\n]{0,20}$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 25), m.index)) && !raw.split(".").some((p) => Number(p) > 31)) continue;
      const value = d.kind === "ADDRESS" ? streetPart(raw) : raw;
      // Already masked (the street became a label and the city stayed): nothing left to hide.
      if (ONLY_TOKENS.test(value)) continue;
      const index = (m.index ?? 0) + (m[0].indexOf(raw) >= 0 ? m[0].indexOf(raw) : 0);
      hits.push({ kind: d.kind, detector: d.name, value, index });
    }
  }
  return hits;
}
