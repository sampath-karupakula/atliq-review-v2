// Mirror check (feature 20): when AtliQ is the buyer (an agency or freelancer works for AtliQ), "would we accept
// this if a client sent it to us?". The rules that flag the clauses are in lib/checks/baseline.ts (fairness, never
// Serious); this adds the fair version and what AtliQ pushes back on when a client asks the same. Pure.

import { topicOf } from "@/lib/verify/severity";

export type MirrorFinding = { id: string; check: string; category: string | null; title: string; clause: string | null; quote: string | null; howToSoften: string | null; dismissed: boolean };
export type BaselineTerm = { term: string; usual: string };
export type MirrorItem = { findingId: string; category: string; title: string; clause: string | null; quote: string | null; fairVersion: string; clientSide: string | null };

/** Fair buyer-side wording AtliQ can offer instead, by topic (AtliQ's buyer-side terms: PixelCraft, Oct 2025). */
export const FAIR_VERSION: Record<string, string> = {
  delay_penalty: "0.5% of the milestone fee for each week of delay, capped at 5% of that milestone fee; no penalty for delays AtliQ or its client causes.",
  liability: "Each party's total liability is capped at the fees paid under this agreement, with a separate higher cap for breaches of confidentiality or data protection.",
  payment: "Invoices are payable within 30 days of receipt, whether or not AtliQ's client has paid AtliQ.",
  termination: "Either party may end this agreement on 30 days' written notice; work done and work in progress up to the end date are paid.",
  confidentiality: "Confidentiality is mutual, with the standard exceptions (public, already known, independently developed, received from a third party, required by law), and lasts 3 years after the agreement ends.",
  indemnity: "Each party indemnifies the other for its own breach and negligence only.",
  ip: "Work product created for AtliQ is assigned to AtliQ on payment; the vendor keeps its pre-existing tools and licenses them to AtliQ for the deliverables.",
};

/** The client-side baseline term each topic corresponds to. */
const TERM_OF: Record<string, string> = {
  delay_penalty: "delay_penalty",
  liability: "liability_cap",
  payment: "payment_days",
  termination: "termination_for_convenience",
  confidentiality: "confidentiality",
  indemnity: "indemnity",
  ip: "ip",
};

export function mirrorItems(findings: MirrorFinding[], baseline: BaselineTerm[]): MirrorItem[] {
  return findings
    .filter((f) => f.check === "fairness" && !f.dismissed)
    .map((f) => {
      const category = topicOf(f.category, f.title);
      const usual = baseline.find((b) => b.term === TERM_OF[category])?.usual ?? null;
      return {
        findingId: f.id,
        category,
        title: f.title.replace(/^AtliQ's own paper:\s*/i, ""),
        clause: f.clause,
        quote: f.quote,
        fairVersion: FAIR_VERSION[category] ?? f.howToSoften ?? "Use AtliQ's usual buyer-side terms.",
        clientSide: usual ? `When a client asks this of AtliQ, AtliQ pushes back; its usual is: ${usual}` : null,
      };
    });
}
