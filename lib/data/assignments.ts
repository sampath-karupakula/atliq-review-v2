import "server-only";
// Who reviews a contract, and by when. A contract is assigned at upload or later; the assignee starts the AI review
// on their own time (nothing is sent to the AI at upload). One open assignment per contract: a new one replaces it.
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, contracts } from "@/lib/db/schema";
import { formatDate } from "@/lib/checks/dates";
import { notify } from "./notify";
import { logEvent } from "./audit";

export async function currentAssignment(contractId: string) {
  const [a] = await getDb()
    .select()
    .from(assignments)
    .where(and(eq(assignments.contractId, contractId), eq(assignments.status, "assigned")))
    .orderBy(desc(assignments.createdAt))
    .limit(1);
  return a ?? null;
}

export async function createAssignment(args: { contractId: string; reviewer: string; reviewDeadline: string; concerns?: string | null; by: string }) {
  const db = getDb();
  const [c] = await db.select({ id: contracts.id, title: contracts.title }).from(contracts).where(eq(contracts.id, args.contractId));
  if (!c) throw new Error("Contract not found.");
  await db.update(assignments).set({ status: "done", completedAt: new Date() }).where(and(eq(assignments.contractId, c.id), eq(assignments.status, "assigned")));
  const [a] = await db
    .insert(assignments)
    .values({ contractId: c.id, reviewer: args.reviewer, assignedBy: args.by, reviewDeadline: args.reviewDeadline, concerns: args.concerns || null })
    .returning();
  const self = args.reviewer === args.by;
  if (!self) {
    await notify({
      recipient: args.reviewer,
      kind: "assigned",
      contractId: c.id,
      text: `${args.by} asked you to review ${c.title} by ${formatDate(args.reviewDeadline)}. Start the AI review when you're ready.${args.concerns ? ` What to look at: ${args.concerns}` : ""}`,
      dedupeKey: `assigned:${a.id}`,
    });
  }
  await logEvent({
    actor: args.by,
    action: "review.assign",
    contractId: c.id,
    text: self ? `Took the review of ${c.title}, due ${formatDate(args.reviewDeadline)}` : `Assigned the review of ${c.title} to ${args.reviewer}, due ${formatDate(args.reviewDeadline)}`,
  });
  return a;
}
