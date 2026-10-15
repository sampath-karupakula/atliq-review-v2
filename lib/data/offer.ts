import "server-only";
// Inputs for "Can I offer this?": the register (with rate cards, assets and waivers) and the usual terms, in the
// shape lib/offer/check.ts reads. Small enough to send to the browser, so answers appear as you type.
import { desc, eq, gte, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { offerChecks } from "@/lib/db/schema";
import type { OfferPromise, OfferTerm } from "@/lib/offer/check";
import { getCoverage, getRegister, type Coverage } from "./register";
import { getBaseline } from "./reference";

export type OfferInputs = { promises: OfferPromise[]; terms: OfferTerm[]; coverage: Coverage };

export async function getOfferInputs(): Promise<OfferInputs> {
  const [register, baseline, coverage] = await Promise.all([getRegister(), getBaseline(), getCoverage()]);
  return {
    promises: register.map((r) => ({
      id: r.id,
      type: r.type,
      contract: r.contract,
      clauses: r.clauses,
      territory: r.territory,
      domain: r.domain,
      activity: r.activity,
      ends: r.ends,
      status: r.status,
      rates: (r.extra.reference_rates_usd_per_hour as Record<string, number> | undefined) ?? null,
      assets: (r.extra.assets_affected as string[] | undefined) ?? [],
      waiverScopes: r.waivers.map((w) => w.scope),
    })),
    terms: baseline.map((b) => ({ term: b.term, usual: b.usual, hardLine: b.hardLine })),
    coverage,
  };
}

export async function recentChecks(actor: string, limit = 12) {
  return getDb().select().from(offerChecks).where(eq(offerChecks.actor, actor)).orderBy(desc(offerChecks.createdAt)).limit(limit);
}

export async function checksSince(actor: string, since: Date) {
  return getDb()
    .select()
    .from(offerChecks)
    .where(and(eq(offerChecks.actor, actor), gte(offerChecks.createdAt, since)));
}
