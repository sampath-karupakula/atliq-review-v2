"use server";
// Review hand-off (P10): assign with warnings, mark findings, finish the review, second reviewer, counsel questions.
// Nothing here sends anything outside AtliQ Review: counsel sees questions in-app, nudges are in-app notifications.
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assignments, contracts, counselQuestions, findings, negotiationConditions, secondReviews } from "@/lib/db/schema";
import { authorize, getCurrentUser, PermissionError } from "@/lib/auth/session";
import type { Action, Context } from "@/lib/auth/permissions";
import { logEvent } from "@/lib/data/audit";
import { notify } from "@/lib/data/notify";
import { adminNames, isActiveUser, listPeople } from "@/lib/data/people";
import { getMarking, reviewerRole, upsertMark } from "@/lib/data/handoff";
import { canFinish, markList, pushbackFromMarks, type Mark } from "@/lib/review/handoff";
import { formatDate } from "@/lib/checks/dates";
import type { ActionResult } from "./workflow";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function who(action: Action, ctx: Context = {}): Promise<string | { error: string }> {
  try {
    return (await authorize(action, ctx)).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

/** The reviewer acting on the marking screen: only the open assignee (first or second) marks; Karandeep reads. */
async function marker(contractId: string): Promise<{ name: string; kind: "first" | "second" } | { error: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: "Sign in first." };
  const role = await reviewerRole(contractId, me.name);
  if (!role) return { error: "Only the assigned reviewer marks this review." };
  const r = await who("review.mark", { assignee: me.name });
  if (typeof r !== "string") return r;
  return { name: r, kind: role.kind };
}

export async function setMark(contractId: string, findingId: string, mark: Mark, note: string): Promise<ActionResult> {
  if (!["agree", "disagree", "question"].includes(mark)) return { ok: false, error: "Choose agree, disagree or question." };
  const m = await marker(contractId);
  if ("error" in m) return { ok: false, error: m.error };
  const [f] = await getDb().select({ id: findings.id }).from(findings).where(eq(findings.id, findingId));
  if (!f) return { ok: false, error: "Finding not found." };
  await upsertMark({ contractId, findingId, reviewer: m.name, mark, note: note.trim().slice(0, 1000) || null });
  revalidatePath(`/mark/${contractId}`);
  return { ok: true };
}

export async function setConditionAddressed(contractId: string, conditionId: string, addressed: "yes" | "no"): Promise<ActionResult> {
  const m = await marker(contractId);
  if ("error" in m) return { ok: false, error: m.error };
  await getDb()
    .update(negotiationConditions)
    .set({ addressed })
    .where(and(eq(negotiationConditions.id, conditionId), eq(negotiationConditions.contractId, contractId)));
  revalidatePath(`/mark/${contractId}`);
  return { ok: true };
}

/** Review done: only when every finding is marked; questions and disagreements become comments on the report. */
export async function finishReview(contractId: string): Promise<ActionResult> {
  const m = await marker(contractId);
  if ("error" in m) return { ok: false, error: m.error };
  const page = await getMarking(contractId, m.name);
  if (!page) return { ok: false, error: "Contract not found." };
  const list = markList(page.findings);
  const gate = canFinish(list, page.marks, page.conditions);
  if (!gate.ok) return { ok: false, error: `Not yet: ${gate.why}.` };
  const db = getDb();
  const at = new Date().toISOString();
  for (const mk of page.marks.filter((x) => x.mark !== "agree" && x.note)) {
    const [f] = await db.select({ comments: findings.comments }).from(findings).where(eq(findings.id, mk.findingId));
    if (!f) continue;
    const text = mk.mark === "question" ? `Question for Karandeep: ${mk.note}` : `Disagrees: ${mk.note}`;
    await db.update(findings).set({ comments: [...f.comments, { by: m.name, at, text }] }).where(eq(findings.id, mk.findingId));
  }
  if (m.kind === "second") {
    await db.update(secondReviews).set({ status: "done", completedAt: new Date() }).where(and(eq(secondReviews.contractId, contractId), eq(secondReviews.status, "assigned")));
  } else if (page.assignment) {
    await db.update(assignments).set({ status: "done", completedAt: new Date() }).where(eq(assignments.id, page.assignment.id));
  }
  const pushback = pushbackFromMarks(list, page.marks).length;
  const questions = page.marks.filter((x) => x.mark === "question").length;
  const summary = `${m.name} finished the ${m.kind === "second" ? "second" : "first"} review of ${page.contract.title}: ${pushback} to push back on${questions ? `, ${questions} question${questions === 1 ? "" : "s"} for you` : ""}.`;
  for (const r of await adminNames()) if (r !== m.name) await notify({ recipient: r, kind: "review_done", contractId, text: summary, dedupeKey: `review-done:${contractId}:${m.name}:${page.contract.version}` });
  await logEvent({ actor: m.name, action: "review.assign_done", contractId, text: summary, detail: { pushback, questions, kind: m.kind } });
  revalidatePath(`/mark/${contractId}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// The heartbeat adds a minute at most once a minute per reviewer and contract.
const lastBeat = new Map<string, number>();
export async function reviewHeartbeat(contractId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Sign in first." };
  const role = await reviewerRole(contractId, me.name);
  if (!role) return { ok: true };
  const key = `${contractId}:${me.name}`;
  const now = Date.now();
  if (now - (lastBeat.get(key) ?? 0) < 55_000) return { ok: true };
  lastBeat.set(key, now);
  const db = getDb();
  if (role.kind === "first") {
    await db.update(assignments).set({ minutesSpent: sql`${assignments.minutesSpent} + 1` }).where(and(eq(assignments.contractId, contractId), eq(assignments.reviewer, me.name), eq(assignments.status, "assigned")));
  } else {
    await db.update(secondReviews).set({ minutesSpent: sql`${secondReviews.minutesSpent} + 1` }).where(and(eq(secondReviews.contractId, contractId), eq(secondReviews.reviewer, me.name), eq(secondReviews.status, "assigned")));
  }
  return { ok: true };
}

// ---------- Second reviewer ----------

export async function assignSecondReviewer(contractId: string, reviewer: string, reviewBy: string): Promise<ActionResult> {
  const by = await who("review.assign");
  if (typeof by !== "string") return { ok: false, error: by.error };
  if (!ISO.test(reviewBy)) return { ok: false, error: "Pick a date to review it by." };
  if (!(await isActiveUser(reviewer, ["admin", "reviewer"]))) return { ok: false, error: `${reviewer} has no active reviewer account.` };
  const db = getDb();
  const [c] = await db.select({ title: contracts.title }).from(contracts).where(eq(contracts.id, contractId));
  if (!c) return { ok: false, error: "Contract not found." };
  const [first] = await db.select({ reviewer: assignments.reviewer }).from(assignments).where(eq(assignments.contractId, contractId)).orderBy(desc(assignments.createdAt)).limit(1);
  if (first?.reviewer === reviewer) return { ok: false, error: `${reviewer} is already the first reviewer. Pick someone else for a second pair of eyes.` };
  await db.insert(secondReviews).values({ contractId, reviewer, assignedBy: by, reviewDeadline: reviewBy });
  await notify({ recipient: reviewer, kind: "assigned", contractId, text: `${by} asked you for a second review of ${c.title} by ${formatDate(reviewBy)}.` });
  await logEvent({ actor: by, action: "review.second", contractId, text: `Asked ${reviewer} for a second review of ${c.title}, due ${formatDate(reviewBy)}` });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

export async function declineSecondReview(contractId: string): Promise<ActionResult> {
  const by = await who("review.assign");
  if (typeof by !== "string") return { ok: false, error: by.error };
  await getDb().insert(secondReviews).values({ contractId, reviewer: null, assignedBy: by, status: "declined" });
  await logEvent({ actor: by, action: "review.second", contractId, text: "Chose not to ask for a second review this time" });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

// ---------- Counsel ----------

const Pack = z.object({
  contractId: z.string().uuid(),
  files: z.array(z.string().max(200)).max(20),
  questions: z.array(z.string().trim().min(10, "Each question needs at least a sentence.").max(1000)).min(1, "Write at least one question.").max(10, "Ten questions at most per pack."),
  answerBy: z.string().regex(ISO, "Pick the date you need answers by."),
});

export async function shareCounselPack(input: z.input<typeof Pack>): Promise<ActionResult> {
  const by = await who("counsel.ask");
  if (typeof by !== "string") return { ok: false, error: by.error };
  const p = Pack.safeParse({ ...input, questions: input.questions.map((q) => q.trim()).filter(Boolean) });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the pack." };
  const db = getDb();
  const [c] = await db.select({ title: contracts.title }).from(contracts).where(eq(contracts.id, p.data.contractId));
  if (!c) return { ok: false, error: "Contract not found." };
  const packId = crypto.randomUUID();
  await db.insert(counselQuestions).values(p.data.questions.map((question) => ({ packId, contractId: p.data.contractId, question, files: p.data.files, askedBy: by, answerBy: p.data.answerBy })));
  for (const counsel of await listPeople({ roles: ["viewer"] })) {
    await notify({ recipient: counsel.name, kind: "counsel", contractId: p.data.contractId, text: `${by} shared ${p.data.questions.length} question${p.data.questions.length === 1 ? "" : "s"} on ${c.title}. Answer by ${formatDate(p.data.answerBy)}.` });
  }
  await logEvent({ actor: by, action: "counsel.ask", contractId: p.data.contractId, text: `Shared a counsel pack on ${c.title}: ${p.data.questions.length} question${p.data.questions.length === 1 ? "" : "s"}, answer by ${formatDate(p.data.answerBy)}` });
  revalidatePath(`/contracts/${p.data.contractId}`);
  revalidatePath("/counsel");
  return { ok: true };
}

export async function answerCounselQuestion(questionId: string, answer: string): Promise<ActionResult> {
  const by = await who("counsel.answer");
  if (typeof by !== "string") return { ok: false, error: by.error };
  const text = answer.trim();
  if (text.length < 10) return { ok: false, error: "Write the answer in at least a sentence." };
  const db = getDb();
  const [q] = await db.select().from(counselQuestions).where(eq(counselQuestions.id, questionId));
  if (!q) return { ok: false, error: "Question not found." };
  await db.update(counselQuestions).set({ answer: text.slice(0, 4000), answeredBy: by, answeredAt: new Date() }).where(eq(counselQuestions.id, questionId));
  await notify({ recipient: q.askedBy, kind: "counsel", contractId: q.contractId, text: `${by} answered: “${q.question.slice(0, 80)}${q.question.length > 80 ? "…" : ""}”` });
  await logEvent({ actor: by, action: "counsel.answer", contractId: q.contractId, text: `Answered a counsel question: ${q.question.slice(0, 200)}` });
  revalidatePath("/counsel");
  revalidatePath(`/contracts/${q.contractId}`);
  return { ok: true };
}

export async function nudgeCounsel(questionId: string): Promise<ActionResult> {
  const by = await who("counsel.ask");
  if (typeof by !== "string") return { ok: false, error: by.error };
  const db = getDb();
  const [q] = await db.select().from(counselQuestions).where(eq(counselQuestions.id, questionId));
  if (!q) return { ok: false, error: "Question not found." };
  if (q.answer) return { ok: false, error: "Already answered." };
  if (q.nudgedAt && Date.now() - q.nudgedAt.getTime() < 12 * 3600_000) return { ok: false, error: "Nudged in the last 12 hours already." };
  await db.update(counselQuestions).set({ nudgedAt: new Date() }).where(eq(counselQuestions.id, questionId));
  for (const counsel of await listPeople({ roles: ["viewer"] })) {
    await notify({ recipient: counsel.name, kind: "counsel", contractId: q.contractId, text: `Reminder from ${by}: “${q.question.slice(0, 80)}${q.question.length > 80 ? "…" : ""}”${q.answerBy ? ` is due ${formatDate(q.answerBy)}` : ""}.` });
  }
  await logEvent({ actor: by, action: "counsel.nudge", contractId: q.contractId, text: `Nudged counsel: ${q.question.slice(0, 200)}` });
  revalidatePath("/counsel");
  return { ok: true };
}
