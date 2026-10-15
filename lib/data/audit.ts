import "server-only";
// The audit log. Every workflow action writes one event; the /activity page reads them. Logging never blocks the
// action it records (a failed insert is swallowed), and no contract text is ever written here, only titles.
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

export type AuditAction =
  | "finding.dismiss"
  | "finding.restore"
  | "finding.accept"
  | "finding.withdraw"
  | "finding.comment"
  | "finding.dismiss_many"
  | "decision.set"
  | "review.assign"
  | "review.assign_done"
  | "review.start"
  | "review.cancel"
  | "review.resume"
  | "signed.upload"
  | "review.remind"
  | "negotiation.conditions"
  | "negotiation.drop"
  | "pushback.sent"
  | "pushback.undo"
  | "deal.edit"
  | "contract.edit"
  | "contract.delete"
  | "contract.delete_request"
  | "contract.delete_decline"
  | "template.fix"
  | "decision.request"
  | "deal.note"
  | "offer.check"
  | "review.mark"
  | "review.second"
  | "counsel.ask"
  | "counsel.answer"
  | "counsel.nudge"
  | "commitment.confirm"
  | "commitment.add"
  | "commitment.edit"
  | "waiver.add"
  | "precedent.label"
  | "demo.reset"
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.locked"
  | "auth.password_change"
  | "user.create"
  | "user.role"
  | "user.active"
  | "user.reset";

export async function logEvent(e: {
  actor: string;
  action: AuditAction;
  text: string;
  contractId?: string | null;
  findingId?: string | null;
  dealId?: string | null;
  commitmentId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getDb()
      .insert(auditEvents)
      .values({
        actor: e.actor,
        action: e.action,
        text: e.text.slice(0, 1000),
        contractId: e.contractId ?? null,
        findingId: e.findingId ?? null,
        dealId: e.dealId ?? null,
        commitmentId: e.commitmentId ?? null,
        detail: e.detail ?? {},
      });
  } catch {
    /* the log must never block the action */
  }
}

export async function listEvents(filter: { actor?: string; actionPrefix?: string; contractId?: string; before?: Date; limit?: number }) {
  const where: SQL[] = [];
  if (filter.actor) where.push(eq(auditEvents.actor, filter.actor));
  if (filter.contractId) where.push(eq(auditEvents.contractId, filter.contractId));
  if (filter.before) where.push(lt(auditEvents.at, filter.before));
  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditEvents.at))
    .limit(filter.limit ?? 200);
  return filter.actionPrefix ? rows.filter((r) => r.action.startsWith(filter.actionPrefix!)) : rows;
}

export async function eventsSince(since: Date) {
  return getDb().select().from(auditEvents).where(gte(auditEvents.at, since)).orderBy(desc(auditEvents.at));
}
