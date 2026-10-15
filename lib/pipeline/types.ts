// Shared shapes for the review pipeline.

export type Check =
  | "clash" | "history" | "baseline" | "deal_value" | "entity_law" | "missing_protection" | "bundle_missing"
  | "bundle_conflict" | "pass_down" | "delivery" | "full_read" | "fairness" | "note_gap" | "injection" | "scope";

export type Severity = "serious" | "negotiable" | "minor" | "not_sure" | "info";

/** Why something is (or is not) Serious under P7: Serious needs irreversible, unbounded or a live clash. */
export type Basis = "irreversible" | "unbounded" | "live_clash" | "bounded" | "clarity" | "uncertain" | "history";

export type FindingDraft = {
  /** Stable within a review: F1, F2 … (assigned at finalize). */
  id?: string;
  check: Check;
  /** Contract topic: liability, delay_penalty, indemnity, ip, payment, termination, confidentiality, restriction … */
  category: string;
  /** Severity proposed by the rule or the AI; finalize applies P7 and quote verification. */
  severity: Severity;
  basis: Basis;
  title: string;
  clause: string | null;
  quote: string | null;
  /** "Not found after reading all N clauses" findings carry no quote. */
  absent: boolean;
  whatItMeans: string;
  whatItCouldCost: string;
  howToSoften: string;
  source: "code" | "ai";
  related?: Record<string, unknown>;
  pastPositions?: number[];
};

export type FinalFinding = FindingDraft & {
  id: string;
  quoteVerified: boolean;
  /** Where the quote was actually found (may refine the cited clause). */
  foundIn: string | null;
  highlight: { start: number; end: number } | null;
  notSureReason: string | null;
  /** Set when the contract is a new version of an earlier one. */
  versionTag?: "new" | "unchanged" | "resolved";
  carriedDismissal?: { by: string | null; reason: string | null } | null;
};

export type Band = "Low" | "Medium" | "High";

export type ReviewReport = {
  status: "done" | "failed" | "stopped";
  stop?: { code: string; message: string; duplicateOf?: string | null };
  score: number | null;
  band: Band | null;
  counts: Record<Severity, number>;
  summary: { text: string; findingIds: string[] }[];
  summarySource: "ai" | "code";
  findings: FinalFinding[];
  clausesRead: number;
  clausesFound: number;
  coverageLine: string;
  registerLine: string;
  docType: string;
  model: string | null;
  provider: string | null;
  tokensIn: number;
  tokensOut: number;
  error?: string;
  /** Call notes compared with the contract (AI-6), one item per point in a note. Outside the contract. */
  noteChecks?: NoteCheckResult[];
};

export type NoteCheckResult = {
  noteId: string;
  verdict: "clashes" | "check" | "matches" | "not_in_contract";
  topic: string;
  clause: string | null;
  quote: string | null;
  quoteVerified: boolean;
  explanation: string;
};
