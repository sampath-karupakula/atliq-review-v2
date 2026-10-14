// Maps a finished report's findings to `findings` table rows. Shared by the API (runFinalize) and dev scripts.
import type { findings } from "@/lib/db/schema";
import type { FinalFinding } from "@/lib/pipeline/types";

export function findingRows(reviewId: string, list: FinalFinding[]): (typeof findings.$inferInsert)[] {
  return list.map((f, i) => ({
    reviewId,
    check: f.check,
    category: f.category,
    severity: f.severity,
    title: f.title,
    clause: f.foundIn ?? f.clause,
    quote: f.quote,
    quoteVerified: f.quoteVerified,
    absent: f.absent,
    related: { ...(f.related ?? {}), basis: f.basis, citedClause: f.clause, highlight: f.highlight, notSureReason: f.notSureReason, key: f.id },
    whatItMeans: f.whatItMeans,
    whatItCouldCost: f.whatItCouldCost,
    howToSoften: f.howToSoften,
    pastPositions: f.pastPositions ?? [],
    source: f.source,
    versionTag: f.versionTag ?? null,
    // A dismissal carries over to a new version only when the clause text is unchanged.
    dismissed: !!f.carriedDismissal,
    dismissedBy: f.carriedDismissal?.by ?? null,
    dismissReason: f.carriedDismissal ? `${f.carriedDismissal.reason ?? ""} (carried over: clause unchanged)`.trim() : null,
    sort: i,
  }));
}
