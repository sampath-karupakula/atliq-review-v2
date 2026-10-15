import "server-only";
// Deals and their documents (P9). The checklist, the data gate and which promises are in play are decided by
// lib/deal/checklist.ts; this module only loads the facts. Conflicts shown on the deal page are the findings the
// reviews already stored (clashes with signed promises, documents that contradict each other).
import { desc, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { dealNotes, deals } from "@/lib/db/schema";
import { buildChecklist, dataGate, isComplete, type ChecklistItem, type DealDoc, type Gate, type LivePromise } from "@/lib/deal/checklist";
import { getRegister } from "./register";

type DocRow = {
  deal_id: string;
  id: string;
  role: string;
  doc_type: string;
  title: string;
  counterparty: string;
  is_signed: boolean;
  signed_date: string | null;
  version: number;
  decision: string | null;
  band: string | null;
  score: number | null;
  review_status: string | null;
  reviewer: string | null;
  review_deadline: string | null;
  assignment_status: string | null;
  text: string;
};

async function docsFor(dealIds: string[]): Promise<DocRow[]> {
  if (!dealIds.length) return [];
  return getSql()<DocRow[]>`
    select dd.deal_id, c.id, dd.role, c.doc_type, c.title, c.counterparty, c.is_signed, to_char(c.signed_date, 'YYYY-MM-DD') as signed_date,
           c.version, c.decision, r.band, r.score, r.status as review_status, a.reviewer, to_char(a.review_deadline, 'YYYY-MM-DD') as review_deadline,
           a.status as assignment_status, c.text
    from deal_documents dd
    join contracts c on c.id = dd.contract_id
    left join lateral (select band, score, status from reviews where contract_id = c.id order by started_at desc limit 1) r on true
    left join lateral (select reviewer, review_deadline, status from assignments where contract_id = c.id order by created_at desc limit 1) a on true
    where dd.deal_id in ${getSql()(dealIds)}
    order by dd.role = 'client_contract' desc, c.created_at`;
}

const toDealDoc = (d: DocRow): DealDoc => ({
  id: d.id,
  role: d.role,
  docType: d.doc_type,
  title: d.title,
  isSigned: d.is_signed,
  band: d.review_status === "done" ? d.band : null,
  reviewed: d.assignment_status === "done" || d.decision !== null,
  text: d.text,
});

export async function livePromises(): Promise<LivePromise[]> {
  return (await getRegister())
    .filter((r) => r.status !== "expired")
    .map((r) => ({ id: r.id, type: r.type, contract: r.contract, clauses: r.clauses, territory: r.territory, domain: r.domain, ends: r.ends, waiverScopes: r.waivers.map((w) => w.scope) }));
}

export type DealSummary = {
  id: string;
  name: string;
  owner: string;
  companyName: string | null;
  valueUsd: number | null;
  currency: string;
  domain: string;
  clientCountry: string;
  clientDeadline: string | null;
  docCount: number;
  missing: string[];
  toCheck: number;
  complete: boolean;
  gate: Gate;
  clashes: string[];
};

export async function listDeals(): Promise<DealSummary[]> {
  const sql = getSql();
  const rows = await sql<{ id: string; name: string; owner: string; company_name: string | null; value_usd: string | null; currency: string; domain: string; client_country: string; client_deadline: string | null; phi: boolean | null; personal_data: boolean | null }[]>`
    select d.id, d.name, d.owner, co.name as company_name, d.value_usd, d.currency, d.domain, d.client_country,
           to_char(d.client_deadline, 'YYYY-MM-DD') as client_deadline, d.phi, d.personal_data
    from deals d left join companies co on co.id = d.company_id
    order by d.client_deadline asc nulls last, d.name`;
  const [docs, promises] = await Promise.all([docsFor(rows.map((r) => r.id)), livePromises()]);
  return rows.map((r) => {
    const facts = { clientCountry: r.client_country, domain: r.domain, phi: r.phi, personalData: r.personal_data };
    const mine = docs.filter((d) => d.deal_id === r.id).map(toDealDoc);
    const items = buildChecklist(facts, mine, promises);
    return {
      id: r.id,
      name: r.name,
      owner: r.owner,
      companyName: r.company_name,
      valueUsd: r.value_usd === null ? null : Number(r.value_usd),
      currency: r.currency,
      domain: r.domain,
      clientCountry: r.client_country,
      clientDeadline: r.client_deadline,
      docCount: mine.length,
      missing: items.filter((i) => i.state === "missing").map((i) => i.label),
      toCheck: items.filter((i) => i.state === "check").length,
      complete: isComplete(items),
      gate: dataGate(facts, mine),
      clashes: items.filter((i) => i.promise && i.state === "missing").map((i) => `${i.promise!.contract.split(" —")[0]}${i.promise!.clause ? ` Clause ${i.promise!.clause}` : ""}`),
    };
  });
}

export type DealConflict = { id: string; contractId: string; contractTitle: string; check: string; severity: string; title: string; clause: string | null; quote: string | null; docB: string | null; clauseB: string | null; quoteB: string | null; whatItMeans: string | null; howToSoften: string | null; absent: boolean; flowDown: string | null; quoteVerified: boolean; quoteBVerified: boolean };

export type DealPage = {
  deal: typeof deals.$inferSelect & { companyName: string | null };
  docs: (DealDoc & { signedDate: string | null; version: number; score: number | null; reviewer: string | null; reviewDeadline: string | null; reviewStatus: string | null })[];
  checklist: ChecklistItem[];
  complete: boolean;
  gate: Gate;
  conflicts: DealConflict[];
  notes: (typeof dealNotes.$inferSelect)[];
};

export async function getDeal(id: string): Promise<DealPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const sql = getSql();
  const [d] = await sql<{ company_name: string | null }[]>`select co.name as company_name from deals d left join companies co on co.id = d.company_id where d.id = ${id}`;
  const [deal] = await db.select().from(deals).where(eq(deals.id, id));
  if (!deal) return null;
  const [rows, promises, notes] = await Promise.all([docsFor([id]), livePromises(), db.select().from(dealNotes).where(eq(dealNotes.dealId, id)).orderBy(desc(dealNotes.createdAt))]);
  const docs = rows.map((r) => ({ ...toDealDoc(r), signedDate: r.signed_date, version: r.version, score: r.score, reviewer: r.reviewer, reviewDeadline: r.review_deadline, reviewStatus: r.review_status }));
  const facts = { clientCountry: deal.clientCountry, domain: deal.domain, phi: deal.phi, personalData: deal.personalData };
  const checklist = buildChecklist(facts, docs, promises);

  const contractIds = docs.filter((x) => !x.isSigned).map((x) => x.id);
  const conflicts = contractIds.length
    ? await sql<{ id: string; contract_id: string; contract_title: string; check: string; severity: string; title: string; clause: string | null; quote: string | null; related: Record<string, unknown> | null; what_it_means: string | null; how_to_soften: string | null; absent: boolean; quote_verified: boolean }[]>`
        select f.id, r.contract_id, c.title as contract_title, f."check", f.severity, f.title, f.clause, f.quote, f.related, f.what_it_means, f.how_to_soften, f.absent, f.quote_verified
        from findings f
        join reviews r on r.id = f.review_id
        join contracts c on c.id = r.contract_id
        where r.contract_id in ${sql(contractIds)} and r.status = 'done'
          and r.started_at = (select max(started_at) from reviews r2 where r2.contract_id = r.contract_id and r2.status = 'done')
          and f."check" in ('clash', 'bundle_conflict', 'bundle_missing', 'pass_down') and not f.dismissed
        order by (f.severity = 'serious') desc, f.sort`
    : [];
  return {
    deal: { ...deal, companyName: d?.company_name ?? null },
    docs,
    checklist,
    complete: isComplete(checklist),
    gate: dataGate(facts, docs),
    conflicts: conflicts.map((f) => ({
      id: f.id,
      contractId: f.contract_id,
      contractTitle: f.contract_title,
      check: f.check,
      severity: f.severity,
      title: f.title,
      clause: f.clause,
      quote: f.quote,
      docB: (f.related?.docB as string | undefined) ?? (f.related?.contract as string | undefined) ?? null,
      clauseB: (f.related?.clauseB as string | null | undefined) ?? (f.related?.clause as string | undefined) ?? null,
      quoteB: (f.related?.quoteB as string | null | undefined) ?? (f.related?.quote as string | undefined) ?? null,
      whatItMeans: f.what_it_means,
      howToSoften: f.how_to_soften,
      // Missing from the contractor agreement (it may still quote the words that show why the term is needed).
      absent: f.absent || f.related?.absentInB === true,
      flowDown: (f.related?.flowDown as string | null | undefined) ?? null,
      quoteVerified: f.quote_verified,
      quoteBVerified: f.related?.quoteBVerified === true,
    })),
    notes,
  };
}
