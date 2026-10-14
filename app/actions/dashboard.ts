"use server";
// Dashboard actions: remind a reviewer (an in-app notification; nothing is emailed).
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, contracts } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { notify } from "@/lib/data/notify";
import { logEvent } from "@/lib/data/audit";
import { formatDate } from "@/lib/checks/dates";
import type { ActionResult } from "./workflow";

export async function remindReviewer(contractId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!can(me, "review.assign")) return { ok: false, error: "Only Karandeep sends reminders." };
  const db = getDb();
  const [a] = await db.select().from(assignments).where(and(eq(assignments.contractId, contractId), eq(assignments.status, "assigned"))).orderBy(desc(assignments.createdAt)).limit(1);
  if (!a) return { ok: false, error: "Nobody is assigned to review this contract." };
  const [c] = await db.select({ title: contracts.title }).from(contracts).where(eq(contracts.id, contractId));
  const today = new Date().toISOString().slice(0, 10);
  await notify({
    recipient: a.reviewer,
    kind: "overdue",
    contractId,
    text: `${me.name} is waiting on your first review of ${c?.title ?? "a contract"} (review by ${formatDate(a.reviewDeadline)}).`,
    // One reminder per reviewer, contract and day, however many times the button is pressed.
    dedupeKey: `remind:${a.id}:${today}`,
  });
  await logEvent({ actor: me.name, action: "review.remind", contractId, text: `Reminded ${a.reviewer} about the first review` });
  return { ok: true };
}
