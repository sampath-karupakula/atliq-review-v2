// Applies the version diff to a finished report: tags each finding new/unchanged, appends the previous
// version's findings that disappeared as "resolved" (info, no score impact), and carries dismissals forward
// only where the clause text is unchanged.
import { splitClauses } from "@/lib/ingest/clauses";
import { clauseTextOf, diffVersions } from "@/lib/verify/versionDiff";
import type { FinalFinding, ReviewReport } from "./types";

export type PreviousFinding = {
  key: string;
  check: string;
  category: string;
  clause: string | null;
  title: string;
  quote: string | null;
  dismissed?: boolean;
  dismissReason?: string | null;
  dismissedBy?: string | null;
};

export type VersionedFinding = FinalFinding;

export function applyVersionDiff(report: ReviewReport, currentText: string, previous: PreviousFinding[], previousText: string): ReviewReport & { findings: VersionedFinding[] } {
  const curSegs = splitClauses(currentText).segments;
  const prevSegs = splitClauses(previousText).segments;
  const prevInputs = previous
    .filter((p) => p.check !== "history")
    .map((p) => ({ ...p, clauseText: clauseTextOf(previousText, p.clause, prevSegs) }));
  const curInputs = report.findings
    .filter((f) => f.check !== "history")
    .map((f) => ({ ...f, key: f.id, clauseText: clauseTextOf(currentText, f.foundIn ?? f.clause, curSegs) }));
  const diff = diffVersions(prevInputs, curInputs);
  const tagged = new Map(diff.current.map((c) => [c.key, c]));

  const findings: VersionedFinding[] = report.findings.map((f) => {
    const t = tagged.get(f.id);
    return t ? { ...f, versionTag: t.versionTag, carriedDismissal: t.carryDismissal } : f;
  });
  let n = findings.length;
  for (const r of diff.resolved) {
    n += 1;
    findings.push({
      id: `F${n}`, check: r.check as FinalFinding["check"], category: r.category, severity: "info", basis: "history",
      title: `Resolved since the previous version: ${r.title}`, clause: r.clause, quote: null, absent: true,
      whatItMeans: "This issue was in the previous version and is no longer present.", whatItCouldCost: "Nothing now.", howToSoften: "No action needed.",
      source: "code", quoteVerified: false, foundIn: null, highlight: null, notSureReason: null, versionTag: "resolved",
    });
  }
  return { ...report, findings };
}
