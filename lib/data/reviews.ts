import "server-only";
// Persists the review pipeline between API requests. Each step loads the state, runs within a time budget,
// and saves it back, so no single request comes near Vercel's 300 s limit. The masking key lives only in
// masking_keys (never in the saved state, never logged, never sent to the AI).
import { and, desc, eq, inArray, ne } from "drizzle-orm";
// review status: running | queued (masked, waiting for a background slot) | done | failed
import { getDb } from "@/lib/db/client";
import { aiCalls, assignments, contracts, dealDocuments, deals, findings, maskingKeys, reviews } from "@/lib/db/schema";
import { aiConfig } from "@/lib/config";
import { findAtliqNames } from "@/lib/ingest/doctype";
import { referenceFromDb } from "@/lib/reference/db";
import type { DealContext } from "@/lib/reference/types";
import { bundleStep, checksStep, clashStep, extractStep, finalizeStep, scanStep, startReview, type ReviewState, type StepProgress } from "@/lib/pipeline/steps";
import type { AiCallRecord } from "@/lib/ai/client";
import type { ReviewReport } from "@/lib/pipeline/types";
import { applyVersionDiff, type VersionedFinding } from "@/lib/pipeline/versions";
import { resumePoint, type PipelineStep } from "@/lib/ux/resume";
import { INTERRUPTED_MS as STALE_RUN_MS } from "@/lib/ux/runState";
import { findingRows } from "./findingRows";
import { assertReviewBudget } from "./budget";
import { notify } from "./notify";
import { adminNames } from "./people";

export const STEP_BUDGET_MS = 200_000;
export { STALE_RUN_MS };

/** Thrown when a second review of the same contract is started while one is running (heuristic 5). */
export class ReviewBusyError extends Error {
  constructor() {
    super("A review of this contract is already running.");
  }
}

type StoredState = Omit<ReviewState, "maskKey">;

async function loadContract(contractId: string) {
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) throw new Error("Contract not found.");
  const [d] = c.dealId ? await db.select().from(deals).where(eq(deals.id, c.dealId)) : [];
  const siblings = c.dealId
    ? await db
        .select({ id: contracts.id, title: contracts.title, role: dealDocuments.role, docType: contracts.docType, text: contracts.text })
        .from(dealDocuments)
        .innerJoin(contracts, eq(contracts.id, dealDocuments.contractId))
        .where(and(eq(dealDocuments.dealId, c.dealId), ne(dealDocuments.contractId, c.id)))
    : [];
  return { contract: c, deal: d ?? null, siblings };
}

function dealContext(c: typeof contracts.$inferSelect, d: typeof deals.$inferSelect | null): DealContext {
  return {
    counterparty: c.counterparty,
    valueUsd: d?.valueUsd ?? null,
    currency: d?.currency ?? "USD",
    domain: d?.domain ?? "analytics",
    clientCountry: d?.clientCountry ?? "India",
    deliveredFrom: d?.deliveredFrom ?? "Pune, India",
    dataTouchers: d?.dataTouchers ?? [],
    direction: c.direction === "atliq_buyer" ? "atliq_buyer" : "atliq_supplier",
    personalData: d?.personalData ?? null,
    phi: d?.phi ?? null,
  };
}

const callRecorder = (reviewId: string) => async (r: AiCallRecord) => {
  await getDb().insert(aiCalls).values({
    reviewId, step: r.step, maskedPromptHash: r.maskedPromptHash, provider: r.provider, model: r.model,
    inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, ms: r.ms,
    attempt: r.attempt, ok: r.ok, error: r.error,
  });
};

async function loadState(reviewId: string): Promise<{ state: ReviewState; review: typeof reviews.$inferSelect }> {
  const db = getDb();
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) throw new Error("Review not found.");
  if (review.status !== "running") throw new Error(`This review is ${review.status}.`);
  const key = await db.select({ token: maskingKeys.token, original: maskingKeys.original }).from(maskingKeys).where(eq(maskingKeys.reviewId, reviewId));
  const stored = review.artifacts.state as StoredState;
  return { state: { ...stored, maskKey: key }, review };
}

async function saveState(reviewId: string, state: ReviewState, step: string) {
  const { maskKey: _k, ...stored } = state;
  void _k;
  await getDb()
    .update(reviews)
    .set({ artifacts: { state: stored }, step, tokensIn: state.tokensIn, tokensOut: state.tokensOut, model: state.model, progressAt: new Date() })
    .where(eq(reviews.id, reviewId));
}

async function fail(reviewId: string, err: unknown): Promise<never> {
  const message = err instanceof Error ? err.message : String(err);
  // Only a running review is marked failed: a step aborted by Stop must not overwrite "Cancelled by the user".
  const [r] = await getDb()
    .update(reviews)
    .set({ status: "failed", error: message, finishedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.status, "running")))
    .returning({ contractId: reviews.contractId });
  // The contract goes back to "received" (a failed review is not a review); the queue shows the failure.
  if (r) await getDb().update(contracts).set({ status: "received" }).where(and(eq(contracts.id, r.contractId), eq(contracts.status, "in_review")));
  throw err;
}

/** Create a review and run step 1 (mask + leak check). */
export async function createReview(contractId: string): Promise<{ reviewId: string; parts: { extract: number; scan: number } }> {
  const db = getDb();
  const { contract, deal, siblings } = await loadContract(contractId);
  const [current] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.contractId, contractId), inArray(reviews.status, ["running", "queued"])))
    .orderBy(desc(reviews.startedAt))
    .limit(1);
  if (current && (current.status === "queued" || Date.now() - (current.progressAt ?? current.startedAt).getTime() < STALE_RUN_MS)) throw new ReviewBusyError();
  await assertReviewBudget();
  // An interrupted run being replaced is closed off, so only one review per contract is ever "running".
  if (current) {
    await db
      .update(reviews)
      .set({ status: "failed", error: "Replaced by a new review.", finishedAt: new Date() })
      .where(and(eq(reviews.contractId, contractId), eq(reviews.status, "running")));
  }
  const [review] = await db
    .insert(reviews)
    .values({ contractId, version: contract.version, status: "running", step: "masking", model: aiConfig().model, progressAt: new Date() })
    .returning({ id: reviews.id });
  try {
    const ref = await referenceFromDb();
    const state = startReview({
      text: contract.text,
      deal: dealContext(contract, deal),
      docType: contract.docType,
      title: contract.title,
      atliqNames: findAtliqNames(contract.text),
      ref,
      linked: siblings.map((s) => ({ id: s.id, title: s.title, docType: s.docType, role: s.role, text: s.text })),
    });
    if (state.maskKey.length) await db.insert(maskingKeys).values(state.maskKey.map((k) => ({ reviewId: review.id, ...k })));
    await db.update(reviews).set({ textMasked: state.maskedText, clausesFound: contract.clauseCount }).where(eq(reviews.id, review.id));
    await saveState(review.id, state, "masked");
    await db.update(contracts).set({ status: "in_review" }).where(eq(contracts.id, contractId));
    return { reviewId: review.id, parts: { extract: state.extractParts.length, scan: state.scanParts.length } };
  } catch (err) {
    return fail(review.id, err);
  }
}

/** Stop a running review. Its finished steps are kept, so it can be resumed later. */
export async function cancelReview(reviewId: string): Promise<{ cancelled: true }> {
  const db = getDb();
  const [r] = await db
    .update(reviews)
    .set({ status: "failed", error: "Cancelled by the user.", finishedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), inArray(reviews.status, ["running", "queued"])))
    .returning({ contractId: reviews.contractId });
  if (r) await db.update(contracts).set({ status: "received" }).where(and(eq(contracts.id, r.contractId), eq(contracts.status, "in_review")));
  return { cancelled: true };
}

/** Carry on an interrupted, failed or cancelled review from the step after the last one it saved. */
export async function resumeReview(reviewId: string): Promise<{ reviewId: string; next: PipelineStep }> {
  const db = getDb();
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) throw new Error("Review not found.");
  if (review.status === "done") throw new Error("This review already finished.");
  const next = review.artifacts?.state ? resumePoint(review.step) : null;
  if (!next) throw new Error("This review stopped before it saved any progress; start a new one.");
  const [newer] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.contractId, review.contractId)).orderBy(desc(reviews.startedAt)).limit(1);
  if (newer && newer.id !== reviewId) throw new Error("A newer review of this contract exists; open the contract page.");
  await db.update(reviews).set({ status: "running", error: null, finishedAt: null, leaseUntil: null, progressAt: new Date() }).where(eq(reviews.id, reviewId));
  await db.update(contracts).set({ status: "in_review" }).where(eq(contracts.id, review.contractId));
  return { reviewId, next };
}

export async function runExtract(reviewId: string): Promise<StepProgress> {
  const { state } = await loadState(reviewId);
  try {
    const ref = await referenceFromDb();
    const p = await extractStep(state, ref, { onCall: callRecorder(reviewId), budgetMs: STEP_BUDGET_MS });
    await saveState(reviewId, state, p.done ? "extracted" : `extracting ${p.completed}/${p.total}`);
    return p;
  } catch (err) {
    return fail(reviewId, err);
  }
}

export async function runChecks(reviewId: string): Promise<{ findings: number }> {
  const { state } = await loadState(reviewId);
  try {
    const out = checksStep(state);
    await saveState(reviewId, state, "checked");
    return { findings: out.length };
  } catch (err) {
    return fail(reviewId, err);
  }
}

export async function runClash(reviewId: string): Promise<{ done: true; skipped: boolean }> {
  const { state } = await loadState(reviewId);
  try {
    const ref = await referenceFromDb();
    await clashStep(state, ref, { onCall: callRecorder(reviewId) });
    await saveState(reviewId, state, "clash checked");
    return { done: true, skipped: state.clash === "skipped" };
  } catch (err) {
    return fail(reviewId, err);
  }
}

export async function runBundle(reviewId: string): Promise<{ done: true; skipped: boolean }> {
  const { state } = await loadState(reviewId);
  try {
    const ref = await referenceFromDb();
    await bundleStep(state, ref, { onCall: callRecorder(reviewId) });
    await saveState(reviewId, state, "bundle checked");
    return { done: true, skipped: state.bundle === "skipped" };
  } catch (err) {
    return fail(reviewId, err);
  }
}

export async function runScan(reviewId: string): Promise<StepProgress> {
  const { state } = await loadState(reviewId);
  try {
    const ref = await referenceFromDb();
    const p = await scanStep(state, ref, { onCall: callRecorder(reviewId), budgetMs: STEP_BUDGET_MS });
    await saveState(reviewId, state, p.done ? "scanned" : `scanning ${p.completed}/${p.total}`);
    return p;
  } catch (err) {
    return fail(reviewId, err);
  }
}

/** Verify, apply P7, score, summarise, and write the findings. */
export async function runFinalize(reviewId: string): Promise<ReviewReport> {
  const db = getDb();
  const { state, review } = await loadState(reviewId);
  try {
    const ref = await referenceFromDb();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, review.contractId));
    let report: ReviewReport & { findings: VersionedFinding[] } = await finalizeStep(state, ref, contract.text, { onCall: callRecorder(reviewId) });
    // A returned draft: compare with the previous version's latest finished review.
    if (contract.previousVersionId) {
      const [prevContract] = await db.select().from(contracts).where(eq(contracts.id, contract.previousVersionId));
      const [prevReview] = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.contractId, contract.previousVersionId), eq(reviews.status, "done")))
        .orderBy(desc(reviews.startedAt))
        .limit(1);
      if (prevContract && prevReview) {
        const prev = await db.select().from(findings).where(eq(findings.reviewId, prevReview.id));
        report = applyVersionDiff(
          report,
          contract.text,
          prev.map((p) => ({ key: p.id, check: p.check, category: p.category ?? "other", clause: p.clause, title: p.title, quote: p.quote, dismissed: p.dismissed, dismissReason: p.dismissReason, dismissedBy: p.dismissedBy })),
          prevContract.text,
        );
      }
    }
    await db.transaction(async (tx) => {
      await tx.delete(findings).where(eq(findings.reviewId, reviewId));
      if (report.findings.length) {
        await tx.insert(findings).values(findingRows(reviewId, report.findings));
      }
      await tx
        .update(reviews)
        .set({
          status: "done", step: "done", progressAt: new Date(), leaseUntil: null, score: report.score, band: report.band, summary: report.summary,
          clausesRead: report.clausesRead, clausesFound: report.clausesFound, coverageLine: report.coverageLine,
          tokensIn: report.tokensIn, tokensOut: report.tokensOut, model: report.model, finishedAt: new Date(),
          artifacts: { state: { ...state, maskKey: undefined }, registerLine: report.registerLine, summarySource: report.summarySource, provider: report.provider },
        })
        .where(eq(reviews.id, reviewId));
      await tx.update(contracts).set({ status: "reviewed" }).where(eq(contracts.id, review.contractId));
    });
    const text = `Review finished: ${contract.title} — ${report.band} (${report.score}), ${report.counts.serious} Serious, ${report.counts.negotiable} Negotiable.`;
    // The owner, the person assigned to review it, and the admins.
    const [assigned] = await db.select({ reviewer: assignments.reviewer }).from(assignments).where(and(eq(assignments.contractId, contract.id), eq(assignments.status, "assigned")));
    for (const r of new Set([...(contract.owner ? [contract.owner] : []), ...(assigned ? [assigned.reviewer] : []), ...(await adminNames())])) {
      await notify({ recipient: r, kind: "review_done", contractId: contract.id, reviewId, text, dedupeKey: `review-done:${reviewId}:${r}` });
    }
    return report;
  } catch (err) {
    return fail(reviewId, err);
  }
}

export async function latestReview(contractId: string) {
  const [r] = await getDb().select().from(reviews).where(eq(reviews.contractId, contractId)).orderBy(desc(reviews.startedAt)).limit(1);
  return r ?? null;
}

export async function reviewsFor(contractIds: string[]) {
  if (!contractIds.length) return [];
  return getDb().select().from(reviews).where(inArray(reviews.contractId, contractIds));
}
