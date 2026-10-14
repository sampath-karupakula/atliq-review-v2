// Assign every contract and deal to a company. A deal's documents all belong to the deal's client (so a freelancer
// or agency agreement inside the Harrington deal sits under Harrington); a contract outside any deal belongs to its
// own counterparty. Spellings are merged by companyKey. Idempotent: run after seeding and after each upload.
// (No "server-only" import: the seed script uses this too.)
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, contracts, dealDocuments, deals } from "@/lib/db/schema";
import { companyKey, preferredName } from "@/lib/companies";

const SUPPORTING_ROLES = new Set(["freelancer", "freelancer_nda", "subcontract", "parent_msa", "call_note"]);

/** `countries`: optional counterparty → country (e.g. from the contract tracker) for companies with no deal. */
export async function assignCompanies(countries?: Map<string, string>): Promise<{ companies: number; contracts: number }> {
  const db = getDb();
  const allDeals = await db.select().from(deals);
  const allContracts = await db.select({ id: contracts.id, counterparty: contracts.counterparty, dealId: contracts.dealId }).from(contracts);
  const links = await db.select().from(dealDocuments);

  // The client of each deal: the counterparty of a main (non-supporting) document in it.
  const clientOfDeal = new Map<string, string>();
  for (const d of allDeals) {
    const mains = links.filter((l) => l.dealId === d.id && !SUPPORTING_ROLES.has(l.role)).map((l) => allContracts.find((c) => c.id === l.contractId)?.counterparty).filter(Boolean) as string[];
    const own = allContracts.filter((c) => c.dealId === d.id).map((c) => c.counterparty);
    clientOfDeal.set(d.id, mains[0] ?? own[0] ?? d.name.split(/\s+[—–-]\s+/)[0]);
  }

  // key → names seen and country
  const groups = new Map<string, { names: string[]; country: string | null }>();
  const keyOfContract = new Map<string, string>();
  const keyOfDeal = new Map<string, string>();
  const add = (name: string, country: string | null) => {
    const key = companyKey(name) || name.toLowerCase();
    const g = groups.get(key) ?? { names: [], country: null };
    g.names.push(name);
    g.country = g.country ?? country;
    groups.set(key, g);
    return key;
  };
  for (const d of allDeals) keyOfDeal.set(d.id, add(clientOfDeal.get(d.id)!, d.clientCountry));
  for (const c of allContracts) {
    keyOfContract.set(c.id, c.dealId && keyOfDeal.has(c.dealId) ? keyOfDeal.get(c.dealId)! : add(c.counterparty, countries?.get(companyKey(c.counterparty)) ?? null));
  }

  const idOfKey = new Map<string, string>();
  for (const [key, g] of groups) {
    const name = preferredName(g.names);
    const [row] = await db
      .insert(companies)
      .values({ key, name, country: g.country })
      .onConflictDoUpdate({ target: companies.key, set: { name, country: sql`coalesce(${companies.country}, ${g.country})` } })
      .returning({ id: companies.id });
    idOfKey.set(key, row.id);
  }
  for (const [id, key] of keyOfDeal) await db.update(deals).set({ companyId: idOfKey.get(key)! }).where(eq(deals.id, id));
  for (const [id, key] of keyOfContract) await db.update(contracts).set({ companyId: idOfKey.get(key)! }).where(eq(contracts.id, id));
  // Companies left with no documents (e.g. after re-seeding) are removed.
  await db.execute(sql`delete from companies co where not exists (select 1 from contracts c where c.company_id = co.id) and not exists (select 1 from deals d where d.company_id = co.id)`);
  return { companies: idOfKey.size, contracts: keyOfContract.size };
}
