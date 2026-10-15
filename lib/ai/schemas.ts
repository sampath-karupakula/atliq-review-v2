// Output formats for the AI steps (ROADMAP Appendix A). Strict shape: every key present; unknown → null.
// Validated with zod on every reply (G10). The model returns raw numbers; code does all arithmetic (G5).
// Kept compact on purpose: providers with small per-minute budgets (Groq) count the schema as input.
// Field guidance lives in the prompts (lib/ai/prompts.ts), not in schema descriptions.
import { z } from "zod";

const clause = z.string().nullable();
const quote = z.string().nullable();
const num = z.number().nullable();

export const TERM_TYPES = [
  "liability_cap", "delay_penalty", "payment", "termination_convenience", "indemnity", "ip",
  "confidentiality", "insurance", "warranty", "other",
] as const;

/** Yes/no facts about a term, listed only when true. Meanings are explained in EXTRACT_SYSTEM. */
export const TERM_FLAGS = [
  "unlimited",
  "client_delay_excluded",
  "sole_remedy",
  "not_sole_remedy",
  "mutual",
  "one_way",
  "covers_indemnitee_negligence",
  "pre_existing_assigned",
  "wip_paid",
  "wip_unpaid",
  "pay_when_paid",
  "standard_exceptions_present",
  "no_standard_exceptions",
  "perpetual",
] as const;
export type TermFlag = (typeof TERM_FLAGS)[number];

export const ExtractSchema = z.object({
  atliq_entity_named: z.object({ value: z.string().nullable(), clause, quote }),
  invoicing_entity: z.object({ value: z.string().nullable(), clause, quote }),
  counterparty_country: z.string().nullable(),
  governing_law: z.object({ law: z.string().nullable(), courts: z.string().nullable(), clause, quote }),
  language_precedence: z.object({ language: z.string().nullable(), clause, quote }),
  deal_value: z.object({ amount: num, currency: z.string().nullable(), clause, quote }),
  rate_card: z.array(z.object({ role: z.string(), rate: z.number(), clause, quote })),
  locations: z.array(z.object({ place: z.string(), country: z.string().nullable(), clause })),
  terms: z.array(
    z.object({
      term: z.enum(TERM_TYPES),
      burdens: z.enum(["atliq", "counterparty", "both", "unclear"]),
      rate_pct: num,
      basis: z.string().nullable(),
      period: z.enum(["day", "week", "month", "once"]).nullable(),
      cap_pct: num,
      cap_amount: num,
      days: num,
      amount: num,
      flags: z.array(z.enum(TERM_FLAGS)),
      clause,
      quote,
    }),
  ),
  restrictions: z.array(
    z.object({
      type: z.enum(["non_compete", "exclusivity", "best_price", "non_solicit"]),
      binds: z.enum(["atliq", "counterparty", "both"]),
      scope: z.string(),
      territory: z.string().nullable(),
      duration: z.string().nullable(),
      binds_affiliates: z.boolean().nullable(),
      clause,
      quote,
    }),
  ),
  referenced_documents: z.array(
    z.object({
      name: z.string(),
      present_in_text: z.boolean(),
      governs: z.enum(["data", "liability", "price", "scope", "security", "other"]),
      clause,
      quote,
    }),
  ),
  data: z.object({ personal_data: z.boolean(), phi: z.boolean(), offshore_restriction: z.string().nullable(), clause, quote }),
  not_bound_warranty: z.object({ present: z.boolean(), clause, quote }),
  ai_directed_text: z.array(z.object({ clause, quote })),
});
export type Extract = z.infer<typeof ExtractSchema>;
export type ExtractTerm = Extract["terms"][number];

export const SCAN_CATEGORIES = [
  "liability", "delay_penalty", "indemnity", "ip", "payment", "termination", "confidentiality", "restriction",
  "warranty", "insurance", "law", "entity", "missing_protection", "fairness", "data", "injection", "other",
] as const;

export const ScanSchema = z.object({
  clauses_reviewed: z.array(z.string()),
  findings: z.array(
    z.object({
      category: z.enum(SCAN_CATEGORIES),
      title: z.string(),
      proposed_severity: z.enum(["serious", "negotiable", "minor", "not_sure"]),
      basis: z.enum(["irreversible", "unbounded", "bounded", "clarity", "uncertain"]),
      clause,
      quote,
      absent: z.boolean(),
      what_it_means: z.string(),
      what_it_could_cost: z.string(),
      how_to_soften: z.string(),
    }),
  ),
});
export type Scan = z.infer<typeof ScanSchema>;

export const ClashSchema = z.object({
  judgements: z.array(
    z.object({
      commitment_id: z.string(),
      applies: z.enum(["yes", "no", "unsure"]),
      reason: z.string(),
      contract_clause: clause,
      contract_quote: quote,
      scope_match: z.string(),
    }),
  ),
  new_restrictions_hitting_clients: z.array(
    z.object({ client: z.string(), restriction_clause: clause, quote, reason: z.string() }),
  ),
});
export type Clash = z.infer<typeof ClashSchema>;

export const BundleSchema = z.object({
  gaps: z.array(
    z.object({
      type: z.enum(["pass_down", "conflict", "missing_document", "delivery"]),
      title: z.string(),
      severity: z.enum(["serious", "negotiable", "not_sure"]),
      doc_a: z.string(),
      clause_a: clause,
      quote_a: quote,
      doc_b: z.string(),
      clause_b: clause,
      quote_b: quote,
      absent_in_b: z.boolean(),
      why: z.string(),
      data_must_not_move_until: z.string().nullable(),
      flow_down: z.string().nullable(),
    }),
  ),
});
export type Bundle = z.infer<typeof BundleSchema>;

export const SummarySchema = z.object({
  sentences: z.array(z.object({ text: z.string(), finding_ids: z.array(z.string()) })),
});
export type Summary = z.infer<typeof SummarySchema>;

/** AI-6: call notes compared with the contract (verdict per note; quotes verified by code). */
export const NotesSchema = z.object({
  notes: z.array(
    z.object({
      note_id: z.string(),
      verdict: z.enum(["clashes", "check", "matches", "not_in_contract"]),
      topic: z.string(),
      clause: clause,
      quote: quote,
      explanation: z.string(),
    }),
  ),
});
export type NotesCheck = z.infer<typeof NotesSchema>;
