import "server-only";
// Gathers the facts the stage engine (lib/stage.ts) needs for one contract, plus its history across versions.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, auditEvents, contracts, findings, negotiationConditions, pushbacks, reviews } from "@/lib/db/schema";
import { stageOf, type Stage, type StageFacts } from "@/lib/stage";

export type Condition = typeof negotiationConditions.$inferSelect;
export type Pushback = typeof pushbacks.$inferSelect;
export type HistoryItem = { at: string; text: string };

export type ContractStage = {
  stage: Stage;
  facts: StageFacts;
  conditions: Condition[];
  pushback: Pushback | null;
  history: HistoryItem[];
};

/** Ids of every version of a contract, oldest first (follows previous_version_id back). */
async function versionChain(contractId: string): Promise<{ id: string; version: number; createdAt: Date }[]> {
  const db = getDb();
  const out: { id: string; version: number; createdAt: Date; prev: string | null }[] = [];
  let cur: string | null = contractId;
  for (let i = 0; cur && i < 20; i++) {
    const [c] = await db.select({ id: contracts.id, version: contracts.version, createdAt: contracts.createdAt, prev: contracts.previousVersionId }).from(contracts).where(eq(contracts.id, cur));
    if (!c) break;
    out.unshift(c);
    cur = c.prev;
  }
  return out;
}

const short = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export async function getContractStage(contractId: string): Promise<ContractStage | null> {
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return null;
  const chain = await versionChain(contractId);
  const ids = chain.map((v) => v.id);

  const [rv] = await db.select().from(reviews).where(and(eq(reviews.contractId, contractId), eq(reviews.kind, "incoming"))).orderBy(desc(reviews.startedAt)).limit(1);
  const [asg] = await db.select().from(assignments).where(eq(assignments.contractId, contractId)).orderBy(desc(assignments.createdAt)).limit(1);
  const conditions = await db.select().from(negotiationConditions).where(eq(negotiationConditions.contractId, contractId)).orderBy(asc(negotiationConditions.createdAt));
  const [pb] = await db.select().from(pushbacks).where(eq(pushbacks.contractId, contractId)).orderBy(desc(pushbacks.sentAt)).limit(1);
  const earlierPushbacks = ids.length > 1 ? await db.select({ id: pushbacks.id }).from(pushbacks).where(inArray(pushbacks.contractId, ids.slice(0, -1))) : [];
  const open = rv?.status === "done" ? (await db.select().from(findings).where(eq(findings.reviewId, rv.id))).filter((f) => !f.dismissed && !f.accepted && f.versionTag !== "resolved" && (f.severity === "serious" || f.severity === "negotiable")) : [];
  const openConditions = conditions.filter((x) => x.open).length;

  const facts: StageFacts = {
    review: !rv ? "none" : (rv.status as StageFacts["review"]),
    firstReview: !asg ? "none" : asg.status === "done" ? "done" : "open",
    reviewer: asg?.reviewer ?? null,
    openConditions,
    pushbackItems: open.length + openConditions,
    pushbackSent: !!pb,
    round: c.version,
    negotiatedBefore: earlierPushbacks.length > 0,
    decision: c.decision === "sign_intended" || c.decision === "reject" ? c.decision : null,
    counterparty: c.counterparty.replace(/,?\s+(Inc\.?|LLC|Ltd\.?|Pvt\.? Ltd\.?|Private Limited|GmbH|Co\.)$/i, ""),
  };

  // History, oldest first: built from what happened, across every version.
  const history: { at: Date; text: string }[] = [];
  const allReviews = await db.select().from(reviews).where(and(inArray(reviews.contractId, ids), eq(reviews.kind, "incoming"))).orderBy(asc(reviews.startedAt));
  const allAsg = await db.select().from(assignments).where(inArray(assignments.contractId, ids));
  const events = await db
    .select()
    .from(auditEvents)
    .where(and(inArray(auditEvents.contractId, ids), inArray(auditEvents.action, ["decision.set", "negotiation.conditions", "pushback.sent", "finding.accept", "review.assign"])))
    .orderBy(asc(auditEvents.at));
  for (const v of chain) history.push({ at: v.createdAt, text: `v${v.version} received` });
  for (const r of allReviews) {
    const v = chain.find((x) => x.id === r.contractId)?.version ?? 1;
    if (r.status === "done" && r.finishedAt) history.push({ at: r.finishedAt, text: `AI review of v${v} finished · ${r.band} (${r.score})` });
    else if (r.status === "failed") history.push({ at: r.finishedAt ?? r.startedAt, text: `AI review of v${v} stopped` });
  }
  for (const a of allAsg) {
    history.push({ at: a.createdAt, text: `First review assigned to ${a.reviewer}` });
    if (a.completedAt) history.push({ at: a.completedAt, text: `${a.reviewer} finished the first review` });
  }
  for (const e of events) history.push({ at: e.at, text: e.text });
  history.sort((a, b) => a.at.getTime() - b.at.getTime());

  return { stage: stageOf(facts), facts, conditions, pushback: pb ?? null, history: history.map((h) => ({ at: short(h.at), text: h.text })) };
}
