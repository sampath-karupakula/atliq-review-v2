import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { baselineTerms, positions } from "@/lib/db/schema";

// AtliQ's usual terms (the baseline every report compares against) and past negotiation positions with their labels.
export async function getBaseline() {
  return getDb().select().from(baselineTerms).orderBy(asc(baselineTerms.term));
}

export async function getPositions() {
  return getDb().select().from(positions).orderBy(asc(positions.id));
}
