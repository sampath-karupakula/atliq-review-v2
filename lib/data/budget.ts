import "server-only";
// The hard cost guard for a public deployment: at most REVIEWS_PER_DAY new reviews per UTC day, counted in the
// database (so it holds across serverless instances). Unset = no limit (local development).
import { gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reviews } from "@/lib/db/schema";

export class BudgetError extends Error {
  constructor(limit: number) {
    super(`Today's review budget (${limit} reviews) is used up. Reviews start again tomorrow (UTC); finished reports stay available.`);
  }
}

export function dailyLimit(): number | null {
  const n = Number(process.env.REVIEWS_PER_DAY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function assertReviewBudget(): Promise<void> {
  const limit = dailyLimit();
  if (!limit) return;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(gte(reviews.startedAt, start));
  if (n >= limit) throw new BudgetError(limit);
}
