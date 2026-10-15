"use server";
// Deals (P9): add a call note to a deal, and record a "Can I offer this?" check. The answer is worked out again on
// the server from the register, so a recorded check is never what the browser claimed.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dealNotes, deals, offerChecks } from "@/lib/db/schema";
import { authorize, PermissionError } from "@/lib/auth/session";
import type { Action } from "@/lib/auth/permissions";
import { logEvent } from "@/lib/data/audit";
import { getOfferInputs } from "@/lib/data/offer";
import { checkOffer, overall } from "@/lib/offer/check";
import type { ActionResult } from "./workflow";

async function actor(action: Action): Promise<string | { error: string }> {
  try {
    return (await authorize(action)).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

export async function addCallNote(dealId: string, text: string, calledOn: string): Promise<ActionResult> {
  const who = await actor("deal.note");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const body = text.trim();
  if (body.length < 10) return { ok: false, error: "Write what was said or agreed, in a sentence." };
  if (body.length > 2000) return { ok: false, error: "Keep a note under 2,000 characters; add a second note for more." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calledOn)) return { ok: false, error: "Give the date of the call." };
  const db = getDb();
  const [deal] = await db.select({ id: deals.id, name: deals.name }).from(deals).where(eq(deals.id, dealId));
  if (!deal) return { ok: false, error: "Deal not found." };
  await db.insert(dealNotes).values({ dealId, title: `Call on ${calledOn}`, text: body, approvedBy: who });
  await logEvent({ actor: who, action: "deal.note", dealId, text: `Added a call note to ${deal.name}` });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function recordOfferCheck(query: string): Promise<ActionResult> {
  const who = await actor("offer.record");
  if (typeof who !== "string") return { ok: false, error: who.error };
  const q = query.trim().slice(0, 200);
  if (q.length < 3) return { ok: false, error: "Type what you're about to offer." };
  const inputs = await getOfferInputs();
  const answers = checkOffer(q, inputs.promises, inputs.terms, inputs.coverage);
  const top = answers[0]!;
  await getDb().insert(offerChecks).values({ actor: who, query: q, verdict: overall(answers), head: top.head, source: top.source });
  await logEvent({ actor: who, action: "offer.check", text: `Checked "${q}": ${top.head}` });
  revalidatePath("/offer");
  return { ok: true };
}
