// Prefill for the upload form (Tesler's law): facts the contract already states, guessed by code so the person
// only confirms them. Guesses are suggestions shown in editable fields, never used without the person seeing them.
import { harvestOrgs, stripOrgSuffix } from "@/lib/privacy/names";
import { detectDocType, type DocType } from "./doctype";

export type ContractGuess = {
  docType: DocType;
  title: string;
  counterparty: string | null;
  clientCountry: string | null;
  value: number | null;
  currency: string | null;
  direction: "atliq_supplier" | "atliq_buyer";
  domain: string | null;
  personalData: boolean;
  phi: boolean;
};

const COUNTRIES: [RegExp, string][] = [
  [/Saudi Arabia/i, "Saudi Arabia"],
  [/United Arab Emirates|\bU\.?A\.?E\.?\b|Dubai|Abu Dhabi/i, "United Arab Emirates"],
  [/\bQatar\b|\bDoha\b/i, "Qatar"],
  [/\bOman\b|\bMuscat\b/i, "Oman"],
  [/\bBahrain\b/i, "Bahrain"],
  [/\bKuwait\b/i, "Kuwait"],
  [/\bGermany\b|\bGmbH\b|Bundesrepublik/i, "Germany"],
  [/United Kingdom|England and Wales|\bScotland\b|\bLondon\b/i, "United Kingdom"],
  [/\bIreland\b|\bDublin\b/i, "Ireland"],
  [/\bFrance\b|\bParis\b/i, "France"],
  [/Netherlands|Amsterdam/i, "Netherlands"],
  [/\bSingapore\b/i, "Singapore"],
  [/\bAustralia\b/i, "Australia"],
  [/\bCanada\b/i, "Canada"],
  [/United States|\bU\.?S\.?A\.?\b|Delaware|California|New York|Texas|Massachusetts|Illinois|Washington|Colorado|Ohio|Florida|Georgia/i, "USA"],
  [/\bIndia\b|Maharashtra|Karnataka|Bengaluru|Mumbai|Delhi|Pune|Hyderabad|Chennai/i, "India"],
];

const DOMAINS: [RegExp, string][] = [
  [/hotel|hospitality|resort|serviced apartment/i, "hospitality"],
  [/health|hospital|clinic|patient|HIPAA/i, "healthcare"],
  [/grocer|retail|e-?commerce|store|marketplace/i, "retail"],
  [/travel|airline|booking/i, "travel"],
  [/bank|financ|capital|insurance|lending|payments/i, "financial services"],
  [/logistic|cold chain|warehouse|freight|shipping/i, "logistics"],
  [/manufactur|industrial|factory/i, "manufacturing"],
  [/food|restaurant|FMCG|beverage/i, "food and beverage"],
];

const MONEY = /(USD|US\$|EUR|GBP|INR|\$|€|£|₹)\s?(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?/g;
const CURRENCY: Record<string, string> = { USD: "USD", US$: "USD", $: "USD", EUR: "EUR", "€": "EUR", GBP: "GBP", "£": "GBP", INR: "INR", "₹": "INR" };

/** The counterparty: the first organisation in the parties block that isn't AtliQ. */
function counterpartyOf(text: string): string | null {
  const org = harvestOrgs(text)[0];
  return org ? org.split(/\s+[—–]\s+/)[0].trim() : null;
}

/** The country in the counterparty's own description (the text right after its name), else the first one mentioned. */
function countryOf(text: string, counterparty: string | null): string | null {
  const head = text.slice(0, 6000);
  const at = counterparty ? head.indexOf(counterparty) : -1;
  const near = at >= 0 ? head.slice(at, at + 500) : "";
  for (const scope of [near, head.replace(/AtliQ[^.]*\./gi, "")]) {
    for (const [re, name] of COUNTRIES) if (scope && re.test(scope)) return name;
  }
  return null;
}

/** The total contract value: the largest amount stated in a sentence about the total, contract value or fees. */
function valueOf(text: string): { value: number; currency: string } | null {
  let best: { value: number; currency: string } | null = null;
  for (const sentence of text.split(/(?<=[.;])\s+|\n/)) {
    if (!/total|contract value|aggregate fees|fees? payable|budget/i.test(sentence)) continue;
    // Caps, insurance and penalties also state amounts; they are not the deal value.
    if (/insurance|coverage|liabilit|indemn|penalt|damages|per (occurrence|claim)|breach/i.test(sentence)) continue;
    for (const m of sentence.matchAll(MONEY)) {
      const value = Number(m[2].replace(/,/g, ""));
      if (value >= 1000 && (!best || value > best.value)) best = { value, currency: CURRENCY[m[1]] ?? "USD" };
    }
  }
  return best;
}

export function inspectContract(text: string): ContractGuess {
  const { docType, title } = detectDocType(text);
  const counterparty = counterpartyOf(text);
  const head = text.slice(0, 8000);
  // AtliQ buys when it hires an agency or a freelancer, or when AtliQ is defined as the Client/Customer.
  const atliqIsClient = /AtliQ[^"“]{0,300}["“]\*{0,2}(Client|Customer|Company)\*{0,2}["”]/i.test(head);
  const direction = docType === "subcontract" || docType === "freelancer" || atliqIsClient ? "atliq_buyer" : "atliq_supplier";
  const domainHit = DOMAINS.find(([re]) => re.test(`${title} ${head.replace(/AtliQ[^.]*\./gi, "")}`))?.[1] ?? null;
  const analytics = /analytic|data platform|machine learning|\bAI\b|artificial intelligence|dashboard/i.test(head);
  const money = valueOf(text);
  return {
    docType,
    title,
    counterparty: counterparty ? counterparty : null,
    clientCountry: countryOf(text, counterparty),
    value: money?.value ?? null,
    currency: money?.currency ?? null,
    direction,
    domain: domainHit ? `${domainHit}${analytics ? " analytics" : ""}` : analytics ? "analytics" : null,
    personalData: /personal data|GDPR|data protection|personal information|data subject/i.test(text),
    phi: /\bPHI\b|protected health information|HIPAA/i.test(text),
  };
}

/** A loose key for matching a counterparty to an existing deal name ("Gulf Crown Hotels & Resorts Co." → "gulf crown"). */
export function dealMatchKey(name: string): string {
  return stripOrgSuffix(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(" ");
}
