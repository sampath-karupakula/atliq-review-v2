import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appMeta, baselineTerms, clients, commitments, dealRules, entities, positions, waivers } from "@/lib/db/schema";
import type { Reference } from "./types";

/** The same reference data as referenceFromSeed(), read from Postgres (reflects confirmations made in the app). */
export async function referenceFromDb(): Promise<Reference> {
  const db = getDb();
  const [ents, cmts, wvs, cls, base, pos, rules, cov] = await Promise.all([
    db.select().from(entities),
    db.select().from(commitments).orderBy(asc(commitments.id)),
    db.select().from(waivers),
    db.select().from(clients),
    db.select().from(baselineTerms),
    db.select().from(positions).orderBy(asc(positions.id)),
    db.select().from(dealRules),
    db.select().from(appMeta).where(eq(appMeta.key, "coverage")),
  ]);
  return {
    entities: ents.map((e) => ({ id: e.id as "PVT" | "INC", legalName: e.legalName, aliases: e.aliases, country: e.country, defaultLaw: e.defaultLaw })),
    commitments: cmts.map((c) => ({
      id: c.id, type: c.type, contract: c.contract, signed: c.signed, entity: c.entity, clauses: c.clauses,
      bindsAffiliates: c.bindsAffiliates, activity: c.activity, forWhom: c.forWhom, territory: c.territory,
      territoryRule: c.territoryRule, domain: c.domain, starts: c.starts, ends: c.ends, endRule: c.endRule,
      confirmed: c.confirmed, quote: c.quote, extra: c.extra,
    })),
    waivers: wvs,
    clients: cls,
    baseline: base,
    positions: pos.map(({ confirmed: _c, ...p }) => (void _c, p)),
    dealRules: rules.map((r) => ({ id: r.id, ...r.rule })),
    coverage: (cov[0]?.value as Reference["coverage"]) ?? { onFile: 17, signedInTracker: 30 },
  };
}
