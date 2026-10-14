import "server-only";
// In-app notifications (meeting-2 Should-have). Rows are idempotent via dedupe_key, so deadline reminders can be
// generated on every page load without duplicating.
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, contracts, notifications } from "@/lib/db/schema";
import { appToday } from "@/lib/config";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import type { Person } from "@/lib/people";

export type NotifyKind = "assigned" | "review_done" | "deadline_soon" | "overdue" | "new_version" | "comment" | "decision";

export async function notify(args: { recipient: string; kind: NotifyKind; text: string; contractId?: string | null; reviewId?: string | null; dedupeKey?: string }) {
  await getDb()
    .insert(notifications)
    .values({ recipient: args.recipient, kind: args.kind, text: args.text, contractId: args.contractId ?? null, reviewId: args.reviewId ?? null, dedupeKey: args.dedupeKey ?? null })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/** Review-deadline reminders for open assignments (1 day before, and once overdue), computed from APP_TODAY. */
export async function generateDeadlineReminders(): Promise<void> {
  const db = getDb();
  const today = appToday();
  const open = await db
    .select({ a: assignments, title: contracts.title })
    .from(assignments)
    .innerJoin(contracts, eq(contracts.id, assignments.contractId))
    .where(eq(assignments.status, "assigned"));
  for (const { a, title } of open) {
    const days = daysBetween(today, a.reviewDeadline);
    if (days < 0) {
      await notify({ recipient: a.reviewer, kind: "overdue", contractId: a.contractId, text: `Your review of ${title} is overdue (due ${formatDate(a.reviewDeadline)}).`, dedupeKey: `overdue:${a.id}` });
      await notify({ recipient: a.assignedBy, kind: "overdue", contractId: a.contractId, text: `${a.reviewer}'s review of ${title} is overdue (due ${formatDate(a.reviewDeadline)}).`, dedupeKey: `overdue-by:${a.id}` });
    } else if (days <= 1) {
      await notify({ recipient: a.reviewer, kind: "deadline_soon", contractId: a.contractId, text: `Your review of ${title} is due ${days === 0 ? "today" : "tomorrow"} (${formatDate(a.reviewDeadline)}).`, dedupeKey: `soon:${a.id}` });
    }
  }
}

export async function notificationsFor(person: Person, limit = 30) {
  const db = getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.recipient, person)).orderBy(desc(notifications.createdAt)).limit(limit);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipient, person), eq(notifications.read, false)));
  return { rows, unread };
}
