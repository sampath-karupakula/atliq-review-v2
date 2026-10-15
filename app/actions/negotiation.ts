"use server";
// Negotiation (P6): reject a version as written with conditions, drop a condition, and record that a pushback was
// sent. The app never sends anything: the user copies the email and sends it from their own mailbox.
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts, negotiationConditions, pushbacks } from "@/lib/db/schema";
import { authorize, PermissionError } from "@/lib/auth/session";
import type { Action } from "@/lib/auth/permissions";
import { logEvent } from "@/lib/data/audit";
import { notify } from "@/lib/data/notify";
import type { ActionResult } from "./workflow";

async function actor(action: Action): Promise<string | { error: string }> {
  try {
    return (await authorize(action)).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

/** "Reject as written · open to negotiate": the version goes back to negotiation with Karandeep's conditions. */
export async function rejectAsWritten(contractId: string, conditions: string[]): Promise<ActionResult> {
  const who = await actor("decision.set");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const lines = conditions.map((c) => c.trim()).filter((c) => c.length >= 3).slice(0, 20);
  if (!lines.length) return { ok: false, error: "Add at least one condition, so the client knows what would change your mind." };
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return { ok: false, error: "Contract not found." };
  await db.insert(negotiationConditions).values(lines.map((text) => ({ contractId, round: c.version, text, createdBy: who })));
  await db.update(contracts).set({ decision: null, decisionNote: null, decisionRequestedBy: null, decisionRequestedAt: null, decisionRequestNote: null, status: "negotiating" }).where(eq(contracts.id, contractId));
  await logEvent({ actor: who, action: "negotiation.conditions", contractId, text: `Rejected v${c.version} as written, open to negotiate · ${lines.length} condition${lines.length === 1 ? "" : "s"}`, detail: { conditions: lines } });
  if (c.owner && c.owner !== who) await notify({ recipient: c.owner, kind: "decision", contractId, text: `${who} rejected ${c.title} as written and set ${lines.length} condition${lines.length === 1 ? "" : "s"} to negotiate.` });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

export async function setConditionOpen(conditionId: string, open: boolean): Promise<ActionResult> {
  const who = await actor("decision.set");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const [row] = await getDb().update(negotiationConditions).set({ open }).where(eq(negotiationConditions.id, conditionId)).returning();
  if (!row) return { ok: false, error: "Condition not found." };
  await logEvent({ actor: who, action: "negotiation.drop", contractId: row.contractId, text: `${open ? "Restored" : "Dropped"} the condition “${row.text}”` });
  revalidatePath(`/contracts/${row.contractId}`);
  return { ok: true };
}

/** Record that the pushback email was sent (by the user, from their own email). */
export async function markPushbackSent(contractId: string, items: string[]): Promise<ActionResult> {
  const who = await actor("finding.comment");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const db = getDb();
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return { ok: false, error: "Contract not found." };
  if (!items.length) return { ok: false, error: "There is nothing to push back on." };
  await db.insert(pushbacks).values({ contractId, round: c.version, items: items.slice(0, 50), sentBy: who });
  await db.update(contracts).set({ status: "negotiating" }).where(eq(contracts.id, contractId));
  await logEvent({ actor: who, action: "pushback.sent", contractId, text: `Pushback sent for v${c.version} · ${items.length} item${items.length === 1 ? "" : "s"}` });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

export async function undoPushback(contractId: string): Promise<ActionResult> {
  const who = await actor("finding.comment");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const db = getDb();
  const [last] = await db.select().from(pushbacks).where(eq(pushbacks.contractId, contractId)).orderBy(desc(pushbacks.sentAt)).limit(1);
  if (!last) return { ok: true };
  await db.delete(pushbacks).where(and(eq(pushbacks.id, last.id), eq(pushbacks.contractId, contractId)));
  await logEvent({ actor: who, action: "pushback.undo", contractId, text: "Took back “pushback sent”" });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}
