import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, baselineTerms, companies, contracts, dealDocuments, deals, findings, positions, reviews } from "@/lib/db/schema";
import { getCoverage, coverageLine } from "./register";

export type ReportFinding = typeof findings.$inferSelect;
export type ReportPosition = typeof positions.$inferSelect;

export type ReportData = {
  contract: typeof contracts.$inferSelect;
  company: { id: string; name: string } | null;
  deal: typeof deals.$inferSelect | null;
  bundle: { id: string; title: string; role: string; docType: string; isSigned: boolean; status: string }[];
  review: typeof reviews.$inferSelect | null;
  findings: ReportFinding[];
  positions: ReportPosition[];
  baseline: (typeof baselineTerms.$inferSelect)[];
  versions: { id: string; version: number; createdAt: Date }[];
  assignment: typeof assignments.$inferSelect | null;
  /** Open review assignments per person, shown when assigning (heuristic 5: don't overload a reviewer). */
  reviewerLoad: Record<string, number>;
  registerLine: string;
};

export async function getReport(contractId: string): Promise<ReportData | null> {
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) return null;
  const [deal] = contract.dealId ? await db.select().from(deals).where(eq(deals.id, contract.dealId)) : [];
  const [company] = contract.companyId ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, contract.companyId)) : [];
  const bundle = contract.dealId
    ? await db
        .select({ id: contracts.id, title: contracts.title, role: dealDocuments.role, docType: contracts.docType, isSigned: contracts.isSigned, status: contracts.status })
        .from(dealDocuments)
        .innerJoin(contracts, eq(contracts.id, dealDocuments.contractId))
        .where(and(eq(dealDocuments.dealId, contract.dealId), ne(dealDocuments.contractId, contract.id)))
    : [];
  const [review] = await db.select().from(reviews).where(eq(reviews.contractId, contractId)).orderBy(desc(reviews.startedAt)).limit(1);
  const list = review ? await db.select().from(findings).where(eq(findings.reviewId, review.id)).orderBy(asc(findings.sort)) : [];
  const positionIds = [...new Set(list.flatMap((f) => f.pastPositions))];
  const pos = positionIds.length ? await db.select().from(positions).where(inArray(positions.id, positionIds)) : [];
  const baseline = await db.select().from(baselineTerms);

  // Version chain: walk back through previous versions.
  const versions: ReportData["versions"] = [{ id: contract.id, version: contract.version, createdAt: contract.createdAt }];
  let prevId = contract.previousVersionId;
  while (prevId) {
    const [p] = await db.select().from(contracts).where(eq(contracts.id, prevId));
    if (!p) break;
    versions.unshift({ id: p.id, version: p.version, createdAt: p.createdAt });
    prevId = p.previousVersionId;
  }
  const [assignment] = await db.select().from(assignments).where(eq(assignments.contractId, contractId)).orderBy(desc(assignments.createdAt)).limit(1);
  const open = await db.select({ reviewer: assignments.reviewer }).from(assignments).where(eq(assignments.status, "assigned"));
  const reviewerLoad: Record<string, number> = {};
  for (const o of open) reviewerLoad[o.reviewer] = (reviewerLoad[o.reviewer] ?? 0) + 1;
  const coverage = await getCoverage();
  return {
    contract,
    company: company ?? null,
    deal: deal ?? null,
    bundle,
    review: review ?? null,
    findings: list,
    positions: pos,
    baseline,
    versions,
    assignment: assignment ?? null,
    reviewerLoad,
    registerLine: (review?.artifacts as { registerLine?: string } | undefined)?.registerLine ?? coverageLine(coverage),
  };
}
