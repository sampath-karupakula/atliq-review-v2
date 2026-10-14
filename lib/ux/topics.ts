// Plain-language topics for findings (Miller's law: chunk long reports; heuristic 2: no pipeline jargon).
// A finding's topic comes from its category first, then from its check.

export const TOPIC_ORDER = [
  "Clashes with past promises",
  "Penalties",
  "Liability and insurance",
  "Payment",
  "IP and AtliQ's tools",
  "Data and privacy",
  "Termination",
  "Company and law",
  "Documents in this deal",
  "Confidentiality",
  "Other",
] as const;
export type Topic = (typeof TOPIC_ORDER)[number];

const BY_CATEGORY: Record<string, Topic> = {
  delay_penalty: "Penalties",
  penalty: "Penalties",
  liability: "Liability and insurance",
  insurance: "Liability and insurance",
  indemnity: "Liability and insurance",
  payment: "Payment",
  rates: "Payment",
  ip: "IP and AtliQ's tools",
  data: "Data and privacy",
  privacy: "Data and privacy",
  security: "Data and privacy",
  termination: "Termination",
  law: "Company and law",
  entity: "Company and law",
  confidentiality: "Confidentiality",
  nda: "Confidentiality",
};

const BY_CHECK: Record<string, Topic> = {
  clash: "Clashes with past promises",
  history: "Clashes with past promises",
  entity_law: "Company and law",
  bundle_missing: "Documents in this deal",
  bundle_conflict: "Documents in this deal",
  pass_down: "Documents in this deal",
  delivery: "Documents in this deal",
  deal_value: "Penalties",
};

const CHECK_FIRST = new Set(["clash", "history", "bundle_missing", "bundle_conflict", "pass_down", "delivery"]);

export function topicOf(f: { check: string; category: string | null }): Topic {
  if (CHECK_FIRST.has(f.check)) return BY_CHECK[f.check];
  return BY_CATEGORY[f.category ?? ""] ?? BY_CHECK[f.check] ?? "Other";
}

/** Plain names for the checks, for places that still need them. */
export const CHECK_NAME: Record<string, string> = {
  clash: "Clash with a past promise",
  history: "Expired promise (history)",
  baseline: "AtliQ's usual terms",
  deal_value: "Deal-value arithmetic",
  entity_law: "Company and governing law",
  missing_protection: "Missing protection",
  full_read: "Clause-by-clause read",
  fairness: "One-sided terms",
  injection: "Hidden instructions to the AI",
  scope: "Out of scope",
  note_gap: "Differs from the call note",
  bundle_missing: "Missing deal document",
  bundle_conflict: "Deal documents disagree",
  pass_down: "Agency/freelancer terms don't match",
  delivery: "Where the work is done",
  unreadable: "Unreadable part",
};
