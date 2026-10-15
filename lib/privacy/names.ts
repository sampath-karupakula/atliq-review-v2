// Harvesting names to mask: counterparties, people on Name:/Attn: lines, people named next to a role,
// people inferred from email addresses, and the defined short names of the counterparty.

const ORG_SUFFIX =
  /\b(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|Inc\.?|LLC|L\.L\.C\.|GmbH|AG|S\.A\.|PLC|LLP|Co\.|Corporation|Corp\.?|Company|FZ-LLC|FZE|FZCO|Group|Ltda\.?|S\.p\.A\.|B\.V\.|Pty\.? Ltd\.?|SAOG|SAOC|W\.L\.L\.|KSC)\s*$/i;

/** Words that are never part of a person's name in these documents. */
const NOT_NAME = new Set(
  (
    "Client Customer Supplier Vendor Contractor Company Partner Party Parties Agreement Services Service Effective Date " +
    "Bank Business Bay Floor Road Street Tower House Data Project Managing Director Finance Chief Executive Officer " +
    "Schedule Fees Fee Day Operations Programme Program Platform Annex Exhibit Section Clause General The This That " +
    "Hotels Hotel Group Limited Private Technologies Inc Health Systems Manager Sponsor Contact Notices Payments " +
    "Signature Name Title For And Of On Behalf Mr Ms Mrs Dr Day-to-day Project Delivery Account Head Lead Senior " +
    "Junior Data Engineer Analyst Officer Legal Counsel Procurement Commercial Technical Information Security Privacy " +
    "Covered Entity Associate Business Master Statement Work Order Purchase Annual Monthly Weekly Quarterly United " +
    "States Kingdom India Indian Arab Emirates Saudi Arabia Germany German Dubai Pune Mumbai Delhi Bengaluru Chennai " +
    "Hyderabad Kochi Nagpur Riyadh Doha Muscat Kuwait Bahrain Oman Qatar London Texas Delaware Illinois California " +
    "New Jersey York Princeton Houston Chicago Austin Munich Hamburg Atliq AtliQ Liability Indemnity Confidential " +
    "Intellectual Property Rights Term Termination Governing Law Courts Arbitration Insurance Warranty Warranties " +
    "Revenue Managers Commercial Technology Marketing Sales Human Resources Property Properties General Regional Area " +
    "Country Vice Assistant Deputy Principal Team Department Board Committee Steering Programme Portfolio Guest Guests " +
    "Provider Providers Members Member Personnel Staff Employees Officers Directors Representatives Affiliates Users " +
    "Module Platform Dashboard Dashboards Analytics Systems System Office Offices Centre Center Hub Lab Labs Studio " +
    // Industry words: shared by a company name and ordinary defined terms ("Hospitality Business"), never a name alone.
    "Hospitality Retail Logistics Foods Food Insurance Clinics Clinic Healthcare Travels Travel Capital Financial " +
    "Solutions Consulting Software Digital Holdings Industries International Global Resorts Grocers Pharma Bank Partners"
  ).split(/\s+/),
);

/** Case-insensitive view (names in parties blocks are often written in capitals). */
const NOT_NAME_LOWER = new Set([...NOT_NAME].map((w) => w.toLowerCase()));

const CAP_WORD ="[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)?";
const PERSON = `(${CAP_WORD}(?:\\s+${CAP_WORD}){1,2})`;

function looksLikePerson(name: string): boolean {
  const words = name.trim().split(/\s+/);
  return words.length >= 2 && words.length <= 3 && words.every((w) => !NOT_NAME.has(w.replace(/[’'].*$/, "")));
}

const ROLE_AFTER =
  "(?:the\\s+)?(?:[A-Z][a-z]+\\s){0,3}(?:Director|Manager|Officer|Head|Lead|Counsel|Partner|Engineer|Analyst|Consultant|President|Secretary|Controller|Founder|Owner|Proprietor|CEO|CFO|CTO|COO|CIO|CISO)\\b";
const CUE_BEFORE =
  "(?:Mr|Ms|Mrs|Dr|Shri|Smt|Prof)\\.?\\s+|(?:Director|Manager|Officer|Chairman|Founder|Partner|contact|Contact|sponsor|Sponsor|copy to|attention of|Attention|signed by|represented by|Contact person|Attn\\.?)\\s*[,:]?\\s+(?:(?:Mr|Ms|Mrs|Dr)\\.?\\s+)?";

/** People named next to a role or honorific, on Name:/Attn: lines, or as the counterparty individual. */
export function harvestPeople(text: string): string[] {
  const out = new Set<string>();
  const add = (n: string | undefined) => {
    if (!n) return;
    const name = n.replace(/\s+/g, " ").trim();
    if (looksLikePerson(name)) out.add(name);
  };
  for (const m of text.matchAll(/^\s*(?:Name|Attn|Attention|Signed by|Signatory|By|Patient(?: [Nn]ame)?)\s*:\s*([^,\n_|]+)/gim)) {
    const raw = m[1].replace(/\*\*/g, "").trim();
    // Single-word names on signature lines (e.g. "Karandeep") are still names.
    if (/^[A-Z][a-z]+$/.test(raw) && !NOT_NAME.has(raw)) out.add(raw);
    else add(raw);
  }
  for (const m of text.matchAll(new RegExp(`(?:${CUE_BEFORE})${PERSON}`, "g"))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`${PERSON},\\s+${ROLE_AFTER}`, "g"))) add(m[1]);
  // An individual counterparty: "**Daniel Ortiz**, an individual"
  for (const m of text.matchAll(/\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\*\*,?\s+(?:an individual|a freelance|residing)/g)) add(m[1]);
  return [...out];
}

/** "sunita.wagh@x.example" → "Sunita Wagh"; "meghna.k@x" → first name "Meghna" (completed from the text). */
export function peopleFromEmails(text: string, emails: string[]): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const local = e.split("@")[0].replace(/\d+$/, "");
    const parts = local.split(/[._-]+/).filter((p) => /^[a-z]+$/i.test(p));
    if (parts.length === 0 || parts[0].length < 3) continue;
    const first = parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase();
    if (NOT_NAME.has(first) || ["info", "legal", "contracts", "admin", "accounts", "support", "notices", "hello", "sales"].includes(parts[0].toLowerCase())) continue;
    if (parts.length >= 2 && parts[1].length >= 2) {
      const last = parts[1][0].toUpperCase() + parts[1].slice(1).toLowerCase();
      out.add(`${first} ${last}`);
    }
    // Complete a first name from the text: "Meghna Kulkarni".
    for (const m of text.matchAll(new RegExp(`\\b${first}\\s+(${CAP_WORD})\\b`, "g"))) {
      if (!NOT_NAME.has(m[1])) out.add(`${first} ${m[1]}`);
    }
  }
  return [...out];
}

/** Organisation names in bold in the opening of the document (the parties block), other than AtliQ. */
export function harvestOrgs(text: string): string[] {
  const head = text.slice(0, 6000);
  const out = new Set<string>();
  for (const m of head.matchAll(/\*\*([^*\n]{3,90})\*\*/g)) {
    const name = m[1]
      .replace(/^(?:for and on behalf of|for|signed for|on behalf of)\s+/i, "")
      .replace(/[,;:]+$/, "")
      .trim();
    if (/atliq/i.test(name)) continue;
    // A defined term ("the Company", "this Agreement") is not a name, however it is formatted.
    if (/^(?:the|this|such|each|any|said)\s/i.test(name)) continue;
    // A real name has at least one distinctive, capitalised word before the legal suffix ("Company" alone is a defined term).
    const base = stripOrgSuffix(name);
    if (ORG_SUFFIX.test(name) && base.length >= 2 && base.split(/\s+/).some((w) => /^[A-Z0-9]/.test(w) && !NOT_NAME.has(w))) out.add(name);
  }
  return [...out];
}

/** Legal suffix removed: "Shree Ganesh Cold Chain Private Limited" → "Shree Ganesh Cold Chain". */
export function stripOrgSuffix(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 3; i++) n = n.replace(ORG_SUFFIX, "").replace(/[,\s]+$/, "");
  return n;
}

/**
 * Defined short names that refer to an organisation, e.g. ("**Lakeshore**") or ("**Harrington**" or "**Client**").
 * Kept only when the term shares a distinctive word with the organisation's name, so role words like
 * "Client" or "Supplier" are never masked.
 */
export function definedShortNames(text: string, orgs: string[]): string[] {
  const head = text.slice(0, 8000);
  const orgWords = new Set(
    orgs
      .flatMap((o) => stripOrgSuffix(o).split(/[\s&-]+/))
      .filter((w) => w.length >= 4 && !NOT_NAME_LOWER.has(w.toLowerCase()))
      .map((w) => w.toLowerCase()),
  );
  const out = new Set<string>();
  for (const m of head.matchAll(/["“]\*\*([^*"”\n]{2,40})\*\*["”]/g)) {
    const term = m[1].trim();
    if (NOT_NAME.has(term)) continue;
    if (term.split(/[\s&-]+/).some((w) => orgWords.has(w.toLowerCase()))) out.add(term);
  }
  return [...out];
}

/** Short forms of a known organisation name used for dictionary masking ("Al Noor Hospitality Group" → "Al Noor"). */
export function orgVariants(name: string): string[] {
  const base = stripOrgSuffix(name.split(/\s+[—–]\s+/)[0]);
  const out = new Set<string>([name.split(/\s+[—–]\s+/)[0].trim(), base]);
  const words = base.split(/\s+/).filter((w) => w !== "&");
  if (words.length > 1) {
    const lead = words[0].length < 4 ? words.slice(0, 2).join(" ") : words[0];
    if (lead.length >= 5 && !NOT_NAME.has(lead)) out.add(lead);
  }
  // The first two words of a longer name are often used alone, e.g. in property or product names
  // ("Gulf Crown Riyadh Olaya" for "Gulf Crown Hotels & Resorts Co.").
  if (words.length >= 3 && !NOT_NAME.has(words[0]) && !NOT_NAME.has(words[1])) out.add(words.slice(0, 2).join(" "));
  return [...out].filter((v) => v.length >= 3 && !STOPWORDS.has(v.toLowerCase()));
}

/** Words that must never become a mask entry: masking them would hide (and the leak check would flag) ordinary text. */
export const STOPWORDS = new Set(["the", "and", "for", "this", "that", "such", "each", "any", "its", "our", "your", "their", "with", "from", "company", "client", "party", "parties"]);

export const ATLIQ_PEOPLE = ["Karandeep", "Bhavin", "Dhaval", "Jay", "Pranav"];
