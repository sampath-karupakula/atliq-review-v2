"use server";
// Contract controls for the deal owner (or an admin): edit the contract and deal details, delete a contract, and ask
// Karandeep for a quick decision once the first review is done. Deciding stays Karandeep's; nothing is signed or sent.
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
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
import { adminNames, isActiveUser } from "@/lib/data/people";
import { bumpCoverage } from "@/lib/data/signed";
import { formatDate } from "@/lib/checks/dates";
import type { ActionResult } from "./workflow";

const DOC_TYPES = ["msa", "sow", "nda", "baa", "dpa", "partnership", "subcontract", "freelancer", "waiver", "other"] as const;

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

// ---------- Edit details ----------

const Details = z.object({
  title: z.string().trim().min(3, "Give the contract a title.").max(200),
  counterparty: z.string().trim().min(2, "Enter the counterparty's name.").max(200),
  docType: z.enum(DOC_TYPES),
  deal: z
    .object({
      clientDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "The client deadline must be a date.").nullable(),
      deadlineNote: z.string().trim().max(300).nullable(),
      valueUsd: z.number().nonnegative("The deal value can't be negative.").nullable(),
      currency: z.enum(["USD", "EUR", "GBP", "INR", "AED"]),
      domain: z.string().trim().min(2, "Enter the business domain."),
      clientCountry: z.string().trim().min(2, "Enter the client's country."),
      personalData: z.boolean().nullable(),
      phi: z.boolean().nullable(),
      owner: z.string().trim().min(2),
    })
    .nullable(),
});
export type DetailsInput = z.input<typeof Details>;

export async function editContractDetails(contractId: string, input: DetailsInput): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("deal.edit", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  const p = Details.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the details." };
  const d = p.data;
  const db = getDb();
  const changes: string[] = [];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const note = (k: string, label: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) return;
    changes.push(label);
    before[k] = a ?? null;
    after[k] = b ?? null;
  };
  note("title", "title", x.c.title, d.title);
  note("counterparty", "counterparty", x.c.counterparty, d.counterparty);
  note("docType", "document type", x.c.docType, d.docType);
  if (x.deal && d.deal) {
    if (d.deal.owner !== x.deal.owner) {
      // Only an admin hands a deal to someone else, and only to an active person.
      if (u.role !== "admin") return { ok: false, error: "Only an admin changes the deal owner." };
      if (!(await isActiveUser(d.deal.owner, ["admin", "reviewer"]))) return { ok: false, error: `${d.deal.owner} has no active account.` };
    }
    note("clientDeadline", "client deadline", x.deal.clientDeadline, d.deal.clientDeadline);
    note("deadlineNote", "deadline note", x.deal.deadlineNote, d.deal.deadlineNote || null);
    note("valueUsd", "deal value", x.deal.valueUsd, d.deal.valueUsd);
    note("currency", "currency", x.deal.currency, d.deal.currency);
    note("domain", "domain", x.deal.domain, d.deal.domain);
    note("clientCountry", "client country", x.deal.clientCountry, d.deal.clientCountry);
    note("personalData", "personal data", x.deal.personalData, d.deal.personalData);
    note("phi", "patient data", x.deal.phi, d.deal.phi);
    note("owner", "deal owner", x.deal.owner, d.deal.owner);
  }
  if (!changes.length) return { ok: true };
  await db.update(contracts).set({ title: d.title, counterparty: d.counterparty, docType: d.docType }).where(eq(contracts.id, contractId));
  if (x.deal && d.deal) {
    // Facts the review used (value, country, data) mark finished reviews as based on old details.
    const factsChanged = ["valueUsd", "currency", "domain", "clientCountry", "personalData", "phi"].some((k) => k in after);
    await db
      .update(deals)
      .set({ ...d.deal, deadlineNote: d.deal.deadlineNote || null, ...(factsChanged ? { updatedAt: new Date() } : {}) })
      .where(eq(deals.id, x.deal.id));
    if ("owner" in after && d.deal.owner !== u.name) await notify({ recipient: d.deal.owner, kind: "assigned", contractId, text: `${u.name} made you the owner of ${x.deal.name}.` });
  }
  const fmt = (v: unknown) => (v ? formatDate(v as string) : "none");
  const parts = changes.map((c) => (c === "client deadline" ? `client deadline ${fmt(before.clientDeadline)} → ${fmt(after.clientDeadline)}` : c));
  const text = `Edited ${x.c.title}: ${parts.join(", ")}`;
  await logEvent({ actor: u.name, action: x.deal && changes.some((c) => !["title", "counterparty", "document type"].includes(c)) ? "deal.edit" : "contract.edit", contractId, dealId: x.deal?.id ?? null, text, detail: { before, after } });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  if (x.deal) revalidatePath(`/deals/${x.deal.id}`);
  return { ok: true };
}

// ---------- Delete ----------

/** Deletes a contract with its reviews, findings, marks and hand-off records. The activity log keeps a line saying
 * who deleted what. Blocked when a later version builds on it or a register promise cites it. */
export async function deleteContract(contractId: string, typedTitle: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("contract.delete", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  if (typedTitle.trim().toLowerCase() !== "delete") return { ok: false, error: "Type DELETE to confirm." };
  const db = getDb();
  const [later] = await db.select({ v: contracts.version }).from(contracts).where(eq(contracts.previousVersionId, contractId));
  if (later) return { ok: false, error: `Version ${later.v} builds on this one. Delete the newer version first.` };
  const cited = await db.select({ id: commitments.id }).from(commitments).where(eq(commitments.contractId, contractId));
  if (cited.length) return { ok: false, error: `The register cites this contract (${cited.map((c) => c.id).join(", ")}). Ask an admin to move those promises first.` };

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
  await logEvent({
    actor: u.name,
    action: "contract.delete",
    text: `Deleted ${x.c.title} (v${x.c.version}${x.c.isSigned ? ", signed" : ""})${dealDeleted && x.deal ? ` and its now-empty deal ${x.deal.name}` : ""}`,
    detail: { contractId, title: x.c.title, dealId: x.deal?.id ?? null },
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
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function withdrawQuickDecision(contractId: string): Promise<ActionResult> {
  const x = await load(contractId);
  if (!x) return { ok: false, error: "Contract not found." };
  const u = await actor("decision.request", x.owner);
  if ("error" in u) return { ok: false, error: u.error };
  await getDb().update(contracts).set({ decisionRequestedBy: null, decisionRequestedAt: null, decisionRequestNote: null }).where(eq(contracts.id, contractId));
  await logEvent({ actor: u.name, action: "decision.request", contractId, text: `Withdrew the quick-decision request on ${x.c.title}` });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
