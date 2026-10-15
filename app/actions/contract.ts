"use server";
// Contract controls. The deal owner (or an admin) changes the client deadline and can ask Karandeep for a quick
// decision once the first review is done. Deleting always goes through an admin, so every deletion is approved and
// tracked: the owner asks with a reason, an admin approves (deletes) or declines. Nothing is signed or sent.
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  aiCalls,
  assignments,
  commitments,
  contractLinks,
  contracts,
  counselQuestions,
  dealDocuments,
  dealNotes,
  deals,
  findingMarks,
  findings,
  maskingKeys,
  negotiationConditions,
  notifications,
  pushbacks,
  reviews,
  secondReviews,
} from "@/lib/db/schema";
import { authorize, PermissionError } from "@/lib/auth/session";
import type { Action } from "@/lib/auth/permissions";
import { logEvent } from "@/lib/data/audit";
import { notify } from "@/lib/data/notify";
import { adminNames } from "@/lib/data/people";
import { bumpCoverage } from "@/lib/data/signed";
import { formatDate } from "@/lib/checks/dates";
import type { ActionResult } from "./workflow";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function load(contractId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) return null;
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return null;
  const [deal] = c.dealId ? await db.select().from(deals).where(eq(deals.id, c.dealId)) : [];
  return { c, deal: deal ?? null, owner: deal?.owner ?? c.owner ?? null };
}

async function actor(action: Action, dealOwner: string | null) {
  try {
    return await authorize(action, { dealOwner });
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

function refresh(contractId: string, dealId?: string | null) {
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

// ---------- Client deadline ----------

/** The one field the deal owner edits on a contract page: the deal's client deadline. */
export async function editClientDeadline(contractId: string, clientDeadline: string | null): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  if (!x.deal) return { ok: false, error: "This contract isn't part of a deal, so it has no client deadline." };
  const u = await actor("deal.edit", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  const next = clientDeadline?.trim() || null;
  if (next && !ISO.test(next)) return { ok: false, error: "The client deadline must be a date." };
  if (next === x.deal.clientDeadline) return { ok: true };
  await getDb().update(deals).set({ clientDeadline: next }).where(eq(deals.id, x.deal.id));
  const fmt = (v: string | null) => (v ? formatDate(v) : "none");
  await logEvent({
    actor: u.name,
    action: "deal.edit",
    contractId,
    dealId: x.deal.id,
    text: `Changed the client deadline of ${x.deal.name}: ${fmt(x.deal.clientDeadline)} → ${fmt(next)}`,
    detail: { before: { clientDeadline: x.deal.clientDeadline }, after: { clientDeadline: next } },
  });
  refresh(contractId, x.deal.id);
  revalidatePath("/deadlines");
  return { ok: true };
}

// ---------- Deletion: the owner asks, an admin approves or declines ----------

export async function requestDeletion(contractId: string, reason: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("contract.delete_request", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  const why = reason.trim().slice(0, 500);
  if (why.length < 10) return { ok: false, error: "Say why it should be deleted, in a sentence. The admin sees it." };
  if (x.c.deletionRequestedBy) return { ok: false, error: `${x.c.deletionRequestedBy} already asked for it to be deleted.` };
  await getDb().update(contracts).set({ deletionRequestedBy: u.name, deletionRequestedAt: new Date(), deletionReason: why }).where(eq(contracts.id, contractId));
  for (const r of await adminNames()) {
    if (r !== u.name) await notify({ recipient: r, kind: "decision", contractId, text: `${u.name} asks you to delete ${x.c.title}: “${why}”` });
  }
  await logEvent({ actor: u.name, action: "contract.delete_request", contractId, text: `Asked an admin to delete ${x.c.title}: ${why}` });
  refresh(contractId);
  return { ok: true };
}

export async function withdrawDeletionRequest(contractId: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("contract.delete_request", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  await getDb().update(contracts).set({ deletionRequestedBy: null, deletionRequestedAt: null, deletionReason: null }).where(eq(contracts.id, contractId));
  await logEvent({ actor: u.name, action: "contract.delete_request", contractId, text: `Withdrew the request to delete ${x.c.title}` });
  refresh(contractId);
  return { ok: true };
}

export async function declineDeletion(contractId: string, note: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("contract.delete", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  const who = x.c.deletionRequestedBy;
  if (!who) return { ok: false, error: "Nobody asked for this contract to be deleted." };
  const why = note.trim().slice(0, 500);
  await getDb().update(contracts).set({ deletionRequestedBy: null, deletionRequestedAt: null, deletionReason: null }).where(eq(contracts.id, contractId));
  if (who !== u.name) await notify({ recipient: who, kind: "decision", contractId, text: `${u.name} kept ${x.c.title} instead of deleting it${why ? `: “${why}”` : "."}` });
  await logEvent({ actor: u.name, action: "contract.delete_decline", contractId, text: `Declined ${who}’s request to delete ${x.c.title}${why ? `: ${why}` : ""}` });
  refresh(contractId);
  return { ok: true };
}

/** Admins only: approving the owner's request, or on their own with a reason. Deletes a contract with its reviews,
 * findings, marks and hand-off records; the activity log keeps who asked, who approved and why. Blocked when a later
 * version builds on it or a register promise cites it. */
export async function deleteContract(contractId: string, typed: string, reason: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("contract.delete", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  if (typed.trim().toLowerCase() !== "delete") return { ok: false, error: "Type DELETE to confirm." };
  const why = (x.c.deletionReason ?? reason).trim().replace(/\.+$/, "");
  if (why.length < 10) return { ok: false, error: "Say why it's being deleted, in a sentence. It's kept in the activity log." };
  const db = getDb();
  const [later] = await db.select({ v: contracts.version }).from(contracts).where(eq(contracts.previousVersionId, contractId));
  if (later) return { ok: false, error: `Version ${later.v} builds on this one. Delete the newer version first.` };
  const cited = await db.select({ id: commitments.id }).from(commitments).where(eq(commitments.contractId, contractId));
  if (cited.length) return { ok: false, error: `The register cites this contract (${cited.map((c) => c.id).join(", ")}). Move those promises first.` };

  let dealDeleted = false;
  await db.transaction(async (tx) => {
    const reviewIds = (await tx.select({ id: reviews.id }).from(reviews).where(eq(reviews.contractId, contractId))).map((r) => r.id);
    await tx.delete(findingMarks).where(eq(findingMarks.contractId, contractId));
    await tx.delete(counselQuestions).where(eq(counselQuestions.contractId, contractId));
    await tx.delete(secondReviews).where(eq(secondReviews.contractId, contractId));
    await tx.delete(negotiationConditions).where(eq(negotiationConditions.contractId, contractId));
    await tx.delete(pushbacks).where(eq(pushbacks.contractId, contractId));
    await tx.delete(assignments).where(eq(assignments.contractId, contractId));
    await tx.delete(notifications).where(eq(notifications.contractId, contractId));
    if (reviewIds.length) {
      await tx.delete(maskingKeys).where(inArray(maskingKeys.reviewId, reviewIds));
      await tx.delete(aiCalls).where(inArray(aiCalls.reviewId, reviewIds));
      await tx.delete(findings).where(inArray(findings.reviewId, reviewIds));
      await tx.delete(reviews).where(inArray(reviews.id, reviewIds));
    }
    await tx.delete(contractLinks).where(or(eq(contractLinks.fromId, contractId), eq(contractLinks.toId, contractId)));
    await tx.delete(dealDocuments).where(eq(dealDocuments.contractId, contractId));
    await tx.delete(contracts).where(eq(contracts.id, contractId));
    // A deal left with no documents goes too (with its call notes), so the Deals page doesn't show an empty card.
    if (x.deal) {
      const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(dealDocuments).where(eq(dealDocuments.dealId, x.deal.id))) as [{ n: number }];
      const [{ m }] = (await tx.select({ m: sql<number>`count(*)::int` }).from(contracts).where(eq(contracts.dealId, x.deal.id))) as [{ m: number }];
      if (n === 0 && m === 0) {
        await tx.delete(dealNotes).where(eq(dealNotes.dealId, x.deal.id));
        await tx.delete(deals).where(eq(deals.id, x.deal.id));
        dealDeleted = true;
      }
    }
  });
  if (x.c.isSigned) await bumpCoverage(-1);
  const asked = x.c.deletionRequestedBy;
  if (asked && asked !== u.name) await notify({ recipient: asked, kind: "decision", text: `${u.name} approved your request and deleted ${x.c.title}.` });
  await logEvent({
    actor: u.name,
    action: "contract.delete",
    text: `Deleted ${x.c.title} (v${x.c.version}${x.c.isSigned ? ", signed" : ""})${asked ? `, approving ${asked}’s request` : ""}: ${why}${dealDeleted && x.deal ? `. Its now-empty deal ${x.deal.name} went too` : ""}`,
    detail: { contractId, title: x.c.title, dealId: x.deal?.id ?? null, requestedBy: asked, approvedBy: u.name, reason: why },
  });
  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  revalidatePath("/deals");
  return { ok: true };
}

// ---------- Quick decision ----------

/** After the first review, the deal owner can ask Karandeep to decide soon (the client wants to sign quickly).
 * It notifies the admins and puts the contract first in Karandeep's "decide" card; deciding clears it. */
export async function requestQuickDecision(contractId: string, note: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("decision.request", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  if (x.c.decision) return { ok: false, error: "Karandeep has already decided." };
  const db = getDb();
  const [review] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.contractId, contractId), eq(reviews.status, "done"))).limit(1);
  if (!review) return { ok: false, error: "Run the AI review first." };
  const [a] = await db.select().from(assignments).where(eq(assignments.contractId, contractId)).orderBy(desc(assignments.createdAt)).limit(1);
  if (a && a.status !== "done") return { ok: false, error: `${a.reviewer} hasn't finished the first review yet.` };
  const why = note.trim().slice(0, 500);
  await db.update(contracts).set({ decisionRequestedBy: u.name, decisionRequestedAt: new Date(), decisionRequestNote: why || null }).where(eq(contracts.id, contractId));
  const deadline = x.deal?.clientDeadline ? ` Client deadline ${formatDate(x.deal.clientDeadline)}.` : "";
  for (const r of await adminNames()) {
    if (r !== u.name) await notify({ recipient: r, kind: "decision", contractId, text: `${u.name} asks for a quick decision on ${x.c.title}.${deadline}${why ? ` “${why}”` : ""}`, dedupeKey: `quick:${contractId}:${new Date().toISOString().slice(0, 13)}` });
  }
  await logEvent({ actor: u.name, action: "decision.request", contractId, text: `Asked for a quick decision on ${x.c.title}${why ? `: ${why}` : ""}` });
  refresh(contractId);
  return { ok: true };
}

export async function withdrawQuickDecision(contractId: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("decision.request", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  await getDb().update(contracts).set({ decisionRequestedBy: null, decisionRequestedAt: null, decisionRequestNote: null }).where(eq(contracts.id, contractId));
  await logEvent({ actor: u.name, action: "decision.request", contractId, text: `Withdrew the quick-decision request on ${x.c.title}` });
  refresh(contractId);
  return { ok: true };
}
