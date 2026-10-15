"use server";
// Template fixes (mirror check): Karandeep approves changing a clause in AtliQ's own buyer-side paper, so the next
// agency or freelancer doesn't receive it; someone marks it done once the template is updated. Nothing is edited here.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts, findings, reviews, templateFixes } from "@/lib/db/schema";
import { authorize, PermissionError } from "@/lib/auth/session";
import { logEvent } from "@/lib/data/audit";
import { getBaseline } from "@/lib/data/reference";
import { mirrorItems } from "@/lib/report/mirror";
import type { ActionResult } from "./workflow";

async function admin(): Promise<string | { error: string }> {
  try {
    return (await authorize("register.edit")).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

export async function approveTemplateFix(contractId: string, findingId: string): Promise<ActionResult> {
  const who = await admin();
  if (typeof who !== "string") return { ok: false, error: who.error };
  const db = getDb();
  const [row] = await db
    .select({ f: findings, title: contracts.title })
    .from(findings)
    .innerJoin(reviews, eq(reviews.id, findings.reviewId))
    .innerJoin(contracts, eq(contracts.id, reviews.contractId))
    .where(and(eq(findings.id, findingId), eq(reviews.contractId, contractId)));
  if (!row) return { ok: false, error: "Finding not found." };
  const [item] = mirrorItems([{ ...row.f, category: row.f.category ?? null }], await getBaseline());
  if (!item) return { ok: false, error: "Only a clause AtliQ wouldn't accept from a client can go on the template list." };
  const [existing] = await db.select({ id: templateFixes.id }).from(templateFixes).where(and(eq(templateFixes.category, item.category), eq(templateFixes.status, "approved")));
  if (existing) return { ok: false, error: "A fix for this topic is already approved and waiting to be made." };
  await db.insert(templateFixes).values({ contractId, contractTitle: row.title, category: item.category, title: item.title, clause: item.clause, quote: item.quote, fairVersion: item.fairVersion, approvedBy: who });
  await logEvent({ actor: who, action: "template.fix", contractId, text: `Approved fixing AtliQ's template: ${item.title} → ${item.fairVersion}` });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/register");
  return { ok: true };
}

export async function markTemplateFixDone(id: string): Promise<ActionResult> {
  const who = await admin();
  if (typeof who !== "string") return { ok: false, error: who.error };
  const [row] = await getDb().update(templateFixes).set({ status: "done", doneBy: who, doneAt: new Date() }).where(eq(templateFixes.id, id)).returning();
  if (!row) return { ok: false, error: "Template fix not found." };
  await logEvent({ actor: who, action: "template.fix", text: `Marked the template fix done: ${row.title}` });
  revalidatePath("/register");
  return { ok: true };
}
