"use server";
// Workflow actions (O9, O11, G8, G9). Every action checks the signed-in user's role on the server (lib/auth):
//   - only admins dismiss or accept Serious findings, confirm commitments, assign reviews and record decisions;
//   - reviewers dismiss non-serious findings, comment and complete their own reviews; viewers are read-only;
//   - a decision can only be recorded when no Serious finding is open (dismissed or accepted with a note).
// No action signs, sends or edits a contract.
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assignments, commitments, contracts, findings, reviews } from "@/lib/db/schema";
import { authorize, getSessionUser, PermissionError, type CurrentUser } from "@/lib/auth/session";
import type { Action, Context } from "@/lib/auth/permissions";
import { adminNames, isActiveUser } from "@/lib/data/people";
import { createAssignment, currentAssignment } from "@/lib/data/assignments";
import { notify } from "@/lib/data/notify";
import { logEvent } from "@/lib/data/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** The signed-in user if their role allows `action`, else the refusal message. */
async function allowed(action: Action, ctx: Context = {}): Promise<CurrentUser | string> {
  try {
    return await authorize(action, ctx);
  } catch (e) {
    return e instanceof PermissionError ? e.message : "Not allowed.";
  }
}

async function findingWithContract(findingId: string) {
  const db = getDb();
  const [row] = await db
    .select({ f: findings, contractId: reviews.contractId, owner: contracts.owner, title: contracts.title })
    .from(findings)
    .innerJoin(reviews, eq(reviews.id, findings.reviewId))
    .innerJoin(contracts, eq(contracts.id, reviews.contractId))
    .where(eq(findings.id, findingId));
  return row ?? null;
}

export async function dismissFinding(findingId: string, reason: string): Promise<ActionResult> {
  const text = reason.trim();
  if (text.length < 5) return fail("Give a reason (a few words) so the dismissal can be audited.");
  const row = await findingWithContract(findingId);
  if (!row) return fail("Finding not found.");
  const u = await allowed("finding.dismiss", { severity: row.f.severity });
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  await getDb().update(findings).set({ dismissed: true, dismissedBy: viewer, dismissReason: text, dismissedAt: new Date() }).where(eq(findings.id, findingId));
  await logEvent({ actor: viewer, action: "finding.dismiss", contractId: row.contractId, findingId, text: `Dismissed “${row.f.title}” (${row.f.severity}): ${text}`, detail: { severity: row.f.severity, reason: text } });
  revalidatePath(`/contracts/${row.contractId}`);
  revalidatePath("/insights");
  return { ok: true };
}

export async function restoreFinding(findingId: string): Promise<ActionResult> {
  const row = await findingWithContract(findingId);
  if (!row) return fail("Finding not found.");
  const u = await allowed("finding.dismiss", { severity: row.f.severity });
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  await getDb().update(findings).set({ dismissed: false, dismissedBy: null, dismissReason: null, dismissedAt: null }).where(eq(findings.id, findingId));
  await logEvent({ actor: viewer, action: "finding.restore", contractId: row.contractId, findingId, text: `Restored “${row.f.title}”` });
  revalidatePath(`/contracts/${row.contractId}`);
  revalidatePath("/insights");
  return { ok: true };
}

/** Karandeep accepts a Serious risk knowingly (with a note); it stays visible but no longer blocks the decision. */
export async function acceptFinding(findingId: string, note: string): Promise<ActionResult> {
  const u = await allowed("finding.accept");
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  // Long enough that the record still makes sense a year later (a rushed 11 pm acceptance included).
  if (note.trim().length < 15) return fail(`Add a little more (${note.trim().length} of 15 characters). Say why, so the record makes sense later.`);
  const row = await findingWithContract(findingId);
  if (!row) return fail("Finding not found.");
  await getDb().update(findings).set({ accepted: true, acceptNote: note.trim() }).where(eq(findings.id, findingId));
  await logEvent({ actor: viewer, action: "finding.accept", contractId: row.contractId, findingId, text: `Accepted the risk “${row.f.title}”: ${note.trim()}`, detail: { note: note.trim() } });
  revalidatePath(`/contracts/${row.contractId}`);
  return { ok: true };
}

/** Undo an acceptance (heuristic 3): the Serious item blocks the decision again. */
export async function withdrawAcceptance(findingId: string): Promise<ActionResult> {
  const u = await allowed("finding.accept");
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  const row = await findingWithContract(findingId);
  if (!row) return fail("Finding not found.");
  const comments = [...row.f.comments, { by: viewer, at: new Date().toISOString(), text: `Withdrew acceptance (was: ${row.f.acceptNote ?? "no note"}).` }];
  await getDb().update(findings).set({ accepted: false, acceptNote: null, comments }).where(eq(findings.id, findingId));
  await logEvent({ actor: viewer, action: "finding.withdraw", contractId: row.contractId, findingId, text: `Withdrew acceptance of “${row.f.title}”` });
  revalidatePath(`/contracts/${row.contractId}`);
  return { ok: true };
}

/** Dismiss several non-serious findings with one shared reason (heuristic 7: "dismiss all minor"). */
export async function dismissMany(findingIds: string[], reason: string): Promise<ActionResult & { count?: number }> {
  const u = await allowed("finding.dismiss", { severity: "minor" });
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  const text = reason.trim();
  if (text.length < 5) return fail("Give a reason (a few words) so the dismissals can be audited.");
  if (!findingIds.length) return fail("Nothing to dismiss.");
  const db = getDb();
  const rows = await db.select({ id: findings.id, severity: findings.severity, reviewId: findings.reviewId }).from(findings).where(inArray(findings.id, findingIds));
  if (rows.some((r) => r.severity === "serious")) return fail("Serious findings must be dismissed one by one.");
  await db.update(findings).set({ dismissed: true, dismissedBy: viewer, dismissReason: text, dismissedAt: new Date() }).where(inArray(findings.id, rows.map((r) => r.id)));
  const [rev] = rows.length ? await db.select({ contractId: reviews.contractId }).from(reviews).where(eq(reviews.id, rows[0].reviewId)) : [];
  if (rev) revalidatePath(`/contracts/${rev.contractId}`);
  revalidatePath("/insights");
  await logEvent({ actor: viewer, action: "finding.dismiss_many", contractId: rev?.contractId ?? null, text: `Dismissed ${rows.length} minor points: ${text}`, detail: { findingIds: rows.map((r) => r.id), reason: text } });
  return { ok: true, count: rows.length };
}

/** Restore several findings at once (the Undo of dismissMany). */
export async function restoreMany(findingIds: string[]): Promise<ActionResult> {
  const db = getDb();
  const rows = await db.select({ id: findings.id, severity: findings.severity, reviewId: findings.reviewId }).from(findings).where(inArray(findings.id, findingIds));
  const u = await allowed("finding.dismiss", { severity: rows.some((r) => r.severity === "serious") ? "serious" : "minor" });
  if (typeof u === "string") return fail(u);
  if (!rows.length) return { ok: true };
  await db.update(findings).set({ dismissed: false, dismissedBy: null, dismissReason: null, dismissedAt: null }).where(inArray(findings.id, rows.map((r) => r.id)));
  const [rev] = await db.select({ contractId: reviews.contractId }).from(reviews).where(eq(reviews.id, rows[0].reviewId));
  if (rev) revalidatePath(`/contracts/${rev.contractId}`);
  revalidatePath("/insights");
  return { ok: true };
}

export async function addComment(findingId: string, text: string): Promise<ActionResult> {
  const u = await allowed("finding.comment");
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  const body = text.trim();
  if (!body) return fail("Write a comment first.");
  const row = await findingWithContract(findingId);
  if (!row) return fail("Finding not found.");
  const comments = [...row.f.comments, { by: viewer, at: new Date().toISOString(), text: body.slice(0, 2000) }];
  await getDb().update(findings).set({ comments }).where(eq(findings.id, findingId));
  // Tell the contract owner and the admins (but not the person who wrote it).
  for (const r of new Set([...(row.owner ? [row.owner] : []), ...(await adminNames())])) {
    if (r !== viewer) await notify({ recipient: r, kind: "comment", contractId: row.contractId, text: `${viewer} commented on "${row.f.title}" (${row.title}).` });
  }
  await logEvent({ actor: viewer, action: "finding.comment", contractId: row.contractId, findingId, text: `Commented on “${row.f.title}”: ${body.slice(0, 300)}` });
  revalidatePath(`/contracts/${row.contractId}`);
  return { ok: true };
}

const AssignInput = z.object({
  contractId: z.string().uuid(),
  reviewer: z.string().trim().min(2, "Choose a reviewer."),
  reviewDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date to review it by."),
  concerns: z.string().max(2000).optional().default(""),
});

export async function assignReview(input: z.input<typeof AssignInput>): Promise<ActionResult> {
  const u = await allowed("review.assign");
  if (typeof u === "string") return fail(u);
  const parsed = AssignInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the assignment details.");
  if (!(await isActiveUser(parsed.data.reviewer, ["admin", "reviewer"]))) return fail(`${parsed.data.reviewer} has no active reviewer account.`);
  try {
    await createAssignment({ ...parsed.data, by: u.name });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't assign.");
  }
  revalidatePath(`/contracts/${parsed.data.contractId}`);
  revalidatePath("/contracts");
  return { ok: true };
}

/** A reviewer takes an unassigned contract for themselves (review by the date they choose). */
export async function takeReview(contractId: string, reviewDeadline: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDeadline)) return fail("Pick a date to review it by.");
  const current = await currentAssignment(contractId);
  const u = await allowed("review.take", { assignee: current?.reviewer ?? null });
  if (typeof u === "string") return fail(u);
  try {
    await createAssignment({ contractId, reviewer: u.name, reviewDeadline, by: u.name });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't take it.");
  }
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  return { ok: true };
}

export async function completeAssignment(contractId: string): Promise<ActionResult> {
  const db = getDb();
  const [a] = await db.select().from(assignments).where(and(eq(assignments.contractId, contractId), eq(assignments.status, "assigned"))).orderBy(desc(assignments.createdAt)).limit(1);
  if (!a) return fail("Nobody is assigned to review this contract.");
  const u = await allowed("assignment.complete", { assignee: a.reviewer });
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  await db.update(assignments).set({ status: "done", completedAt: new Date() }).where(eq(assignments.id, a.id));
  if (viewer !== a.assignedBy) await notify({ recipient: a.assignedBy, kind: "review_done", contractId, text: `${viewer} finished reviewing it.`, dedupeKey: `assign-done:${a.id}` });
  await logEvent({ actor: viewer, action: "review.assign_done", contractId, text: `Marked the review done (assigned to ${a.reviewer})` });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  return { ok: true };
}

/**
 * Records Karandeep's decision as a status only (G8). Locked while any Serious finding is open — i.e. neither
 * dismissed nor explicitly accepted with a note. Nothing is signed or sent.
 */
export async function setDecision(contractId: string, decision: "sign_intended" | "reject" | null, note: string): Promise<ActionResult> {
  const u = await allowed("decision.set");
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  if (decision === "reject" && note.trim().length < 5) return fail("Write a short note saying why it is rejected.");
  const db = getDb();
  const [review] = await db.select().from(reviews).where(and(eq(reviews.contractId, contractId), eq(reviews.status, "done"))).orderBy(desc(reviews.startedAt)).limit(1);
  if (!review) return fail("Review the contract first.");
  if (decision === "sign_intended") {
    const open = (await db.select().from(findings).where(eq(findings.reviewId, review.id))).filter((f) => f.severity === "serious" && !f.dismissed && !f.accepted);
    if (open.length) return fail(`${open.length} Serious item${open.length > 1 ? "s are" : " is"} still open. Resolve, dismiss or accept each with a note first.`);
  }
  const [c] = await db
    .update(contracts)
    // Deciding answers any quick-decision request.
    .set({ decision, decisionNote: note.trim() || null, ...(decision ? { decisionRequestedBy: null, decisionRequestedAt: null, decisionRequestNote: null } : {}), status: decision === "reject" ? "rejected" : decision === "sign_intended" ? "decided" : "reviewed" })
    .where(eq(contracts.id, contractId))
    .returning();
  if (c?.owner && c.owner !== viewer && decision) {
    await notify({ recipient: c.owner, kind: "decision", contractId, text: `${viewer} marked ${c.title}: ${decision === "reject" ? "reject" : "intends to sign"}.` });
  }
  await logEvent({
    actor: viewer,
    action: "decision.set",
    contractId,
    text: decision ? `Recorded “${decision === "reject" ? "reject" : "intend to sign"}” for ${c?.title ?? "the contract"}${note.trim() ? `: ${note.trim()}` : ""}` : `Cleared the decision on ${c?.title ?? "the contract"}`,
    detail: { decision, note: note.trim() || null },
  });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  return { ok: true };
}

export async function confirmCommitment(commitmentId: string, confirmed: boolean): Promise<ActionResult> {
  const u = await allowed("register.edit");
  if (typeof u === "string") return fail(u);
  const viewer = u.name;
  await getDb()
    .update(commitments)
    .set({ confirmed, confirmedBy: confirmed ? viewer : null, confirmedAt: confirmed ? new Date() : null })
    .where(eq(commitments.id, commitmentId));
  await logEvent({ actor: viewer, action: "commitment.confirm", commitmentId, text: `${confirmed ? "Confirmed" : "Marked unconfirmed"} commitment ${commitmentId}` });
  revalidatePath("/register");
  return { ok: true };
}

/** Mark the viewer's notifications read (all, or just the given ones). */
export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return fail("Sign in again.");
  const viewer = me.name;
  const { notifications } = await import("@/lib/db/schema");
  const mine = eq(notifications.recipient, viewer);
  await getDb().update(notifications).set({ read: true }).where(ids?.length ? and(mine, inArray(notifications.id, ids)) : mine);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Toggle one notification read/unread (heuristic 3). */
export async function setNotificationRead(id: string, read: boolean): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return fail("Sign in again.");
  const viewer = me.name;
  const { notifications } = await import("@/lib/db/schema");
  await getDb().update(notifications).set({ read }).where(and(eq(notifications.recipient, viewer), eq(notifications.id, id)));
  revalidatePath("/", "layout");
  return { ok: true };
}
