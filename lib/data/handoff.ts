import "server-only";
// Review hand-off (P10): the marking screen's facts, second reviews, counsel questions and review time. Rules about
// what may be finished or warned about live in lib/review/handoff.ts.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { assignments, contracts, counselQuestions, deals, findingMarks, findings, negotiationConditions, reviews, secondReviews } from "@/lib/db/schema";
import { estimateMinutes, type Mark, type MarkRow } from "@/lib/review/handoff";
import { currentAssignment } from "./assignments";

export async function latestDoneReview(contractId: string) {
  const [r] = await getDb()
    .select()
    .from(reviews)
    .where(and(eq(reviews.contractId, contractId), eq(reviews.status, "done")))
    .orderBy(desc(reviews.startedAt))
    .limit(1);
  return r ?? null;
}

export async function openSecondReview(contractId: string) {
  const [s] = await getDb().select().from(secondReviews).where(eq(secondReviews.contractId, contractId)).orderBy(desc(secondReviews.createdAt)).limit(1);
  return s ?? null;
}

/** Whose turn it is on the marking screen: the first reviewer, or the second reviewer. */
export async function reviewerRole(contractId: string, name: string): Promise<{ kind: "first" | "second"; deadline: string | null; concerns: string | null; assignedBy: string } | null> {
  const a = await currentAssignment(contractId);
  if (a && a.reviewer === name) return { kind: "first", deadline: a.reviewDeadline, concerns: a.concerns, assignedBy: a.assignedBy };
  const s = await openSecondReview(contractId);
  if (s && s.status === "assigned" && s.reviewer === name) return { kind: "second", deadline: s.reviewDeadline, concerns: null, assignedBy: s.assignedBy };
  return null;
}

export type MarkingFinding = { id: string; severity: string; title: string; clause: string | null; quote: string | null; whatItMeans: string | null; dismissed: boolean; versionTag: string | null };

export async function getMarking(contractId: string, viewer: string) {
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) return null;
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return null;
  const review = await latestDoneReview(contractId);
  const list: MarkingFinding[] = review
    ? await db
        .select({ id: findings.id, severity: findings.severity, title: findings.title, clause: findings.clause, quote: findings.quote, whatItMeans: findings.whatItMeans, dismissed: findings.dismissed, versionTag: findings.versionTag })
        .from(findings)
        .where(eq(findings.reviewId, review.id))
        .orderBy(asc(findings.sort))
    : [];
  const marks = await db.select().from(findingMarks).where(and(eq(findingMarks.contractId, contractId), eq(findingMarks.reviewer, viewer)));
  const conditions = c.version > 1 ? await db.select().from(negotiationConditions).where(and(eq(negotiationConditions.contractId, contractId), eq(negotiationConditions.round, c.version), eq(negotiationConditions.open, true))) : [];
  const [assignment, second] = await Promise.all([currentAssignment(contractId), openSecondReview(contractId)]);
  const [lastFirst] = await db.select().from(assignments).where(eq(assignments.contractId, contractId)).orderBy(desc(assignments.createdAt)).limit(1);
  return {
    contract: c,
    review,
    findings: list,
    marks: marks.map((m): MarkRow & { updatedAt: Date } => ({ findingId: m.findingId, mark: m.mark as Mark, note: m.note, updatedAt: m.updatedAt })),
    conditions,
    assignment,
    lastFirst: lastFirst ?? null,
    second,
  };
}

export async function upsertMark(args: { contractId: string; findingId: string; reviewer: string; mark: Mark; note: string | null }) {
  await getDb()
    .insert(findingMarks)
    .values({ ...args, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [findingMarks.findingId, findingMarks.reviewer], set: { mark: args.mark, note: args.note, updatedAt: new Date() } });
}

/** Every reviewer's marks on a contract, for the report and Karandeep. */
export async function marksFor(contractId: string) {
  return getDb().select().from(findingMarks).where(eq(findingMarks.contractId, contractId));
}

// ---------- Counsel ----------

export type CounselRow = typeof counselQuestions.$inferSelect & { contractTitle: string; dealName: string | null };

export async function counselQuestionsList(filter: { contractId?: string } = {}): Promise<CounselRow[]> {
  const db = getDb();
  const rows = await db
    .select({ q: counselQuestions, contractTitle: contracts.title, dealName: deals.name })
    .from(counselQuestions)
    .innerJoin(contracts, eq(contracts.id, counselQuestions.contractId))
    .leftJoin(deals, eq(deals.id, contracts.dealId))
    .where(filter.contractId ? eq(counselQuestions.contractId, filter.contractId) : undefined)
    .orderBy(desc(counselQuestions.createdAt));
  return rows.map((r) => ({ ...r.q, contractTitle: r.contractTitle, dealName: r.dealName }));
}

/** Files that can go into a counsel pack: the report, the other documents of the deal, and the signed contracts a clash cites. */
export async function counselPackFiles(contractId: string) {
  const sql = getSql();
  const docs = await sql<{ id: string; title: string; is_signed: boolean }[]>`
    select c.id, c.title, c.is_signed from deal_documents dd join contracts c on c.id = dd.contract_id
    where dd.deal_id = (select deal_id from deal_documents where contract_id = ${contractId} limit 1) and c.id <> ${contractId}`;
  return docs.map((d) => ({ key: `doc:${d.id}`, label: `${d.is_signed ? "Signed" : "Draft"}: ${d.title}` }));
}

// ---------- Review time ----------

export type ReviewTime = { contractId: string; title: string; reviewer: string | null; due: string | null; est: number; spent: number; left: number; done: boolean; over: boolean; basis: string };

/** Estimated against actual minutes for the given contracts' current first reviews. */
export async function reviewTimes(contractIds: string[]): Promise<ReviewTime[]> {
  if (!contractIds.length) return [];
  const sql = getSql();
  const rows = await sql<{ id: string; title: string; doc_type: string; reviewer: string | null; due: string | null; spent: number | null; status: string | null; serious: number | null; reviewed: boolean }[]>`
    select c.id, c.title, c.doc_type, a.reviewer, to_char(a.review_deadline, 'YYYY-MM-DD') as due, a.minutes_spent as spent, a.status,
           (select count(*)::int from findings f where f.review_id = r.id and f.severity = 'serious' and not f.dismissed) as serious,
           r.id is not null as reviewed
    from contracts c
    left join lateral (select * from assignments where contract_id = c.id order by created_at desc limit 1) a on true
    left join lateral (select id from reviews where contract_id = c.id and status = 'done' order by started_at desc limit 1) r on true
    where c.id in ${sql(contractIds)}`;
  return rows.map((r) => {
    const { est, basis } = estimateMinutes(r.doc_type, r.reviewed ? (r.serious ?? 0) : null);
    const spent = r.spent ?? 0;
    const done = r.status === "done";
    return { contractId: r.id, title: r.title, reviewer: r.reviewer, due: r.due, est, spent, left: done ? 0 : Math.max(0, est - spent), done, over: spent > est, basis };
  });
}

export async function secondReviewsFor(contractIds: string[]) {
  if (!contractIds.length) return [];
  return getDb().select().from(secondReviews).where(inArray(secondReviews.contractId, contractIds));
}
