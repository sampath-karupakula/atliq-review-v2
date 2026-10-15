"use server";
// Reset the demo's workflow state (founder only), so a demo can be run again from a clean start. Finished reviews
// and their findings are kept (they cost AI calls to produce); everything people did on top of them is cleared:
// dismissals, accepted risks, comments, decisions, first-review assignments, notifications, deal edits and the
// activity log. The register, contracts and deals themselves are untouched.
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authorize, PermissionError } from "@/lib/auth/session";
import { logEvent } from "@/lib/data/audit";
import type { ActionResult } from "./workflow";

export async function resetDemoState(): Promise<ActionResult> {
  let viewer: string;
  try {
    viewer = (await authorize("demo.reset")).name;
  } catch (e) {
    return { ok: false, error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`update findings set dismissed = false, dismissed_by = null, dismiss_reason = null, dismissed_at = null, accepted = false, accept_note = null, comments = '[]'::jsonb`);
    await tx.execute(sql`delete from finding_marks`);
    await tx.execute(sql`delete from second_reviews`);
    await tx.execute(sql`delete from counsel_questions`);
    await tx.execute(sql`delete from offer_checks`);
    await tx.execute(sql`delete from assignments`);
    await tx.execute(sql`delete from notifications`);
    await tx.execute(sql`delete from audit_events`);
    await tx.execute(sql`update deals set updated_at = null`);
    // Reviews still marked running or queued are closed off (their finished steps stay resumable).
    await tx.execute(sql`update reviews set status = 'failed', error = 'Stopped by a demo reset.', finished_at = now(), lease_until = null where status in ('running', 'queued')`);
    await tx.execute(sql`
      update contracts c set decision = null, decision_note = null,
        status = case when exists (select 1 from reviews r where r.contract_id = c.id and r.status = 'done') then 'reviewed' else 'received' end
      where not c.is_signed`);
  });
  await logEvent({ actor: viewer, action: "demo.reset", text: "Reset the demo: dismissals, accepted risks, comments, decisions, assignments, marks, second reviews, counsel questions, offer checks, notifications and the activity log were cleared. Reviews were kept." });
  revalidatePath("/", "layout");
  return { ok: true };
}
