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
