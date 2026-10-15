import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { baselineTerms, contracts, positions } from "@/lib/db/schema";
import type { SignedRef } from "@/lib/memory/precedent";

// AtliQ's usual terms (the baseline every report compares against) and past negotiation positions with their labels.
export async function getBaseline() {
  return getDb().select().from(baselineTerms).orderBy(asc(baselineTerms.term));
}

export async function getPositions() {
  return getDb().select().from(positions).orderBy(asc(positions.id));
}

/** Signed contracts on file, enough to link a past position to the contract it came from. */
export async function getSignedRefs(): Promise<SignedRef[]> {
  return getDb()
    .select({ id: contracts.id, counterparty: contracts.counterparty, signedDate: contracts.signedDate, title: contracts.title })
    .from(contracts)
    .where(eq(contracts.isSigned, true));
}
