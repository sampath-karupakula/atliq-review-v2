// P7 — strict on Serious, generous below (ROADMAP §7.6):
//   Serious    verified quote AND (irreversible OR unbounded OR live clash)
//   Negotiable bounded money or terms off the baseline
//   Minor      clarity or admin
//   Not sure   unverified, unreadable, unconfirmed or ambiguous
import type { FindingDraft, Severity } from "@/lib/pipeline/types";

export type SeverityDecision = { severity: Severity; notSureReason: string | null };

const SERIOUS_BASES = new Set(["irreversible", "unbounded", "live_clash"]);

export function decideSeverity(f: FindingDraft, quoteVerified: boolean): SeverityDecision {
  if (f.check === "injection") return { severity: "not_sure", notSureReason: "Text addressed to AI reviewers — reported, not obeyed" };
  if (f.severity === "info") return { severity: "info", notSureReason: null };
  if (!f.absent && !quoteVerified) {
    return { severity: "not_sure", notSureReason: "The quote could not be found word for word in the contract — please cross-check" };
  }
  if (f.severity === "not_sure" || f.basis === "uncertain") {
    return { severity: "not_sure", notSureReason: f.related?.notSureReason ? String(f.related.notSureReason) : "Unreadable, ambiguous or unconfirmed — please cross-check" };
  }
  if (f.severity === "serious" && !SERIOUS_BASES.has(f.basis)) return { severity: "negotiable", notSureReason: null };
  return { severity: f.severity, notSureReason: null };
}

const BUYER_CORE = new Set(["payment", "termination", "liability", "delay_penalty", "confidentiality", "indemnity", "ip"]);

/**
 * AtliQ as the buyer (its own paper, sent to an agency or freelancer): the mirror test. A one-sided clause on a core
 * term is something AtliQ would refuse from a client, so it is Negotiable — never Minor, never Serious (AtliQ can
 * change its own paper). A schedule AtliQ's paper refers to but doesn't attach is AtliQ's to supply: Negotiable.
 */
export function buyerSideSeverity(f: Pick<FindingDraft, "check" | "category" | "title">, severity: Severity, direction: string): Severity {
  if (direction !== "atliq_buyer" || severity === "not_sure" || severity === "info") return severity;
  if (f.check === "fairness") return BUYER_CORE.has(topicOf(f.category, f.title)) || severity === "serious" ? "negotiable" : severity;
  if (f.check === "bundle_missing" && severity === "serious") return "negotiable";
  return severity;
}

const TOPIC_WORDS: [string, RegExp][] = [
  // Termination first: "no pay for work in progress" is about termination, not payment terms.
  ["termination", /\b(terminat\w*|exit|notice period|work in progress|wip)\b/i],
  ["payment", /\b(pay|paid|payment|invoice|pay-when-paid|days? (?:to|after))\b/i],
  ["liability", /\b(liabilit\w*|uncapped|unlimited|cap)\b/i],
  ["delay_penalty", /\b(penalt\w*|liquidated|delay)\b/i],
  ["confidentiality", /\b(confidential\w*)\b/i],
  ["indemnity", /\b(indemn\w*)\b/i],
  ["ip", /\b(intellectual property|ownership|assign\w*|vest\w*|work product)\b/i],
];

/** The contract topic of a finding: its category, or — when the AI filed it under a generic "fairness"/"other" — the
 * topic its title names ("Pay-when-paid and payment up to 120 days" → payment). */
export function topicOf(category: string | null | undefined, title: string): string {
  if (category && !["fairness", "other", "missing_protection"].includes(category)) return category;
  return TOPIC_WORDS.find(([, re]) => re.test(title))?.[0] ?? category ?? "other";
}

/** AtliQ's longest acceptable payment term, from the usual terms ("30 days, 45 at most"). */
export const PAYMENT_MAX_DAYS = 45;

/**
 * Code's floor on payment terms (TC25): when AtliQ is paid more than 45 days after invoice, the finding is at least
 * Negotiable, whatever severity the full read proposed. The days come from the verified quote, never the AI.
 */
export function paymentFloor(f: Pick<FindingDraft, "category" | "title" | "quote">, severity: Severity, direction: string): Severity {
  if (direction === "atliq_buyer" || severity !== "minor" || !f.quote) return severity;
  if (topicOf(f.category, f.title) !== "payment") return severity;
  const days = [...f.quote.matchAll(/\((\d{2,3})\)\s*(?:calendar\s+|business\s+)?days|\b(\d{2,3})\s*(?:calendar\s+|business\s+)?days\b/gi)].map((m) => Number(m[1] ?? m[2]));
  return days.some((d) => d > PAYMENT_MAX_DAYS) ? "negotiable" : severity;
}
