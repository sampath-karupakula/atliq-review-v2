"use server";
// Register editing (P8): confirm, correct or add a promise, record a waiver, and label a past position. Only an admin
// changes the register; every change is logged, and reviews pick it up on their next clash check.
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { commitments, positions, waivers } from "@/lib/db/schema";
import { authorize, PermissionError } from "@/lib/auth/session";
import { logEvent } from "@/lib/data/audit";
import type { ActionResult } from "./workflow";

const TYPES = ["non_compete", "best_price", "partner_exclusivity", "ip_assigned"] as const;
const LABELS = ["standard", "deliberate_exception", "waved_through", "unclear"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function editor(): Promise<string | { error: string }> {
  try {
    return (await authorize("register.edit")).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

function done() {
  revalidatePath("/register");
  revalidatePath("/deadlines");
  return { ok: true } as const;
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export async function confirmCommitment(id: string): Promise<ActionResult> {
  const who = await editor();
  if (typeof who !== "string") return { ok: false, error: who.error };
  const [c] = await getDb().update(commitments).set({ confirmed: true, confirmedBy: who, confirmedAt: new Date() }).where(eq(commitments.id, id)).returning();
  if (!c) return { ok: false, error: "Promise not found." };
  await logEvent({ actor: who, action: "commitment.confirm", commitmentId: id, text: `Confirmed ${id} (${c.contract})` });
  return done();
}

export type CommitmentInput = {
  type: string;
  contract: string;
  signed: string;
  entity: string;
  clauses: string;
  bindsAffiliates: boolean;
  activity: string;
  forWhom: string;
  territory: string;
  domain: string;
  starts: string;
  ends: string;
  endRule: string;
  quote: string;
};

function check(v: CommitmentInput): string | null {
  if (!TYPES.includes(v.type as (typeof TYPES)[number])) return "Pick what kind of promise it is.";
  if (v.contract.trim().length < 3) return "Name the contract the promise is in.";
  if (v.activity.trim().length < 10) return "Say what the promise restricts, in a sentence.";
  if (!ISO.test(v.signed) || !ISO.test(v.starts)) return "Signed and start dates are needed.";
  if (v.ends && !ISO.test(v.ends)) return "End date must be a date.";
  if (v.ends && v.ends < v.starts) return "The end date is before the start date.";
  if (!v.ends && !v.endRule.trim()) return "Give an end date, or say how it ends (for example 'term + 18 months').";
  if (v.quote.trim().length < 10) return "Paste the clause wording, so the clash check can quote it.";
  return null;
}

const values = (v: CommitmentInput) => ({
  type: v.type,
  contract: v.contract.trim(),
  signed: v.signed,
  entity: v.entity === "INC" ? "INC" : "PVT",
  clauses: list(v.clauses),
  bindsAffiliates: v.bindsAffiliates,
  activity: v.activity.trim(),
  forWhom: v.forWhom.trim() || "—",
  territory: list(v.territory),
  domain: v.domain.trim() || "—",
  starts: v.starts,
  ends: v.ends || null,
  endRule: v.endRule.trim() || null,
  quote: v.quote.trim(),
});

/** A correction takes the promise back to unconfirmed: someone changed it, so Karandeep reads it again. */
export async function editCommitment(id: string, v: CommitmentInput): Promise<ActionResult> {
  const who = await editor();
  if (typeof who !== "string") return { ok: false, error: who.error };
  const bad = check(v);
  if (bad) return { ok: false, error: bad };
  const db = getDb();
  const [before] = await db.select().from(commitments).where(eq(commitments.id, id));
  if (!before) return { ok: false, error: "Promise not found." };
  const next = values(v);
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
  if (!changed.length) return { ok: true };
  await db.update(commitments).set({ ...next, confirmed: true, confirmedBy: who, confirmedAt: new Date() }).where(eq(commitments.id, id));
  await logEvent({ actor: who, action: "commitment.edit", commitmentId: id, text: `Corrected ${id}: ${changed.join(", ")}`, detail: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) } });
  return done();
}

export async function addCommitment(v: CommitmentInput): Promise<ActionResult & { id?: string }> {
  const who = await editor();
  if (typeof who !== "string") return { ok: false, error: who.error };
  const bad = check(v);
  if (bad) return { ok: false, error: bad };
  const db = getDb();
  const [{ n }] = (await db.select({ n: sql<number>`coalesce(max(substring(${commitments.id} from 5)::int), 0)` }).from(commitments)) as [{ n: number }];
  const id = `CMT-${String(Number(n) + 1).padStart(3, "0")}`;
  await db.insert(commitments).values({ id, ...values(v), confirmed: true, confirmedBy: who, confirmedAt: new Date(), extra: { addedBy: who } });
  await logEvent({ actor: who, action: "commitment.add", commitmentId: id, text: `Added ${id} (${v.contract.trim()})` });
  done();
  return { ok: true, id };
}

export type WaiverInput = { source: string; dated: string; scope: string; excludes: string; quote: string };

export async function addWaiver(commitmentId: string, v: WaiverInput): Promise<ActionResult> {
  const who = await editor();
  if (typeof who !== "string") return { ok: false, error: who.error };
  if (v.source.trim().length < 3) return { ok: false, error: "Name the letter or email that grants the waiver." };
  if (!ISO.test(v.dated)) return { ok: false, error: "Give the date of the waiver." };
  if (v.scope.trim().length < 5) return { ok: false, error: "Say what the waiver allows." };
  if (v.quote.trim().length < 10) return { ok: false, error: "Paste the waiver wording." };
  const db = getDb();
  const [c] = await db.select().from(commitments).where(eq(commitments.id, commitmentId));
  if (!c) return { ok: false, error: "Promise not found." };
  const existing = await db.select({ id: waivers.id }).from(waivers);
  const id = `W-${String(existing.length + 1).padStart(3, "0")}`;
  await db.insert(waivers).values({ id, commitmentId, source: v.source.trim(), dated: v.dated, scope: v.scope.trim(), excludes: v.excludes.trim() || "Nothing stated", quote: v.quote.trim() });
  await logEvent({ actor: who, action: "waiver.add", commitmentId, text: `Added waiver ${id} to ${commitmentId}: ${v.scope.trim()}` });
  return done();
}

/** Labelling a past position: only "standard" ones count as AtliQ's precedent on reports and next steps. */
export async function labelPosition(id: number, label: string): Promise<ActionResult> {
  const who = await editor();
  if (typeof who !== "string") return { ok: false, error: who.error };
  if (!LABELS.includes(label as (typeof LABELS)[number])) return { ok: false, error: "Unknown label." };
  const db = getDb();
  const [before] = await db.select().from(positions).where(eq(positions.id, id));
  if (!before) return { ok: false, error: "Position not found." };
  await db.update(positions).set({ label, confirmed: true }).where(eq(positions.id, id));
  await logEvent({ actor: who, action: "precedent.label", text: `${before.counterparty} · ${before.term}: ${before.label} → ${label}`, detail: { id, before: before.label, after: label } });
  revalidatePath("/register");
  revalidatePath("/contracts", "layout");
  return { ok: true };
}
