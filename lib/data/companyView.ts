import "server-only";
import { getSql } from "@/lib/db/client";
import { appToday } from "@/lib/config";
import { commitmentStatus } from "@/lib/checks/dates";
import { getQueueRows } from "./queue";
import { getSignedContracts, type SignedRow } from "./portfolio";
import { sortQueue, type BandName, type QueueRow } from "@/lib/queue";

// Companies as AtliQ thinks of its clients: each with its open (new) documents, signed documents in force, ended
// ones, and the promises AtliQ made it. Built from the queue and portfolio readers so the numbers always agree.
export type CompanyPromise = { id: string; type: string; quote: string; ends: string | null; status: "live" | "expired" | "permanent" };

export type CompanySummary = {
  id: string;
  name: string;
  country: string | null;
  open: QueueRow[];
  active: SignedRow[];
  ended: SignedRow[];
  promises: CompanyPromise[];
  nearest: string | null;
  worst: BandName | null;
  clash: boolean;
};

const RANK: Record<BandName, number> = { High: 3, Medium: 2, Low: 1 };

export async function getCompanies(): Promise<CompanySummary[]> {
  const sql = getSql();
  const today = appToday();
  const [companies, queue, signed, promises] = await Promise.all([
    sql<{ id: string; name: string; country: string | null }[]>`select id, name, country from companies order by name`,
    getQueueRows(),
    getSignedContracts(),
    sql<{ id: string; type: string; quote: string; ends: string | null; company_id: string | null }[]>`
      select m.id, m.type, m.quote, to_char(m.ends, 'YYYY-MM-DD') as ends, c.company_id
      from commitments m left join contracts c on c.id = m.contract_id`,
  ]);
  return companies.map((co) => {
    const open = sortQueue(queue.filter((q) => q.companyId === co.id));
    const docs = signed.filter((s) => s.companyId === co.id);
    const worst = open.reduce<BandName | null>((w, q) => (q.band && (!w || RANK[q.band] > RANK[w]) ? q.band : w), null);
    return {
      id: co.id,
      name: co.name,
      country: co.country,
      open,
      active: docs.filter((d) => d.inForce),
      ended: docs.filter((d) => !d.inForce),
      promises: promises
        .filter((p) => p.company_id === co.id)
        .map((p) => ({ id: p.id, type: p.type, quote: p.quote, ends: p.ends, status: commitmentStatus({ type: p.type, ends: p.ends }, today) })),
      nearest: open.find((q) => q.deadline)?.deadline ?? null,
      worst,
      clash: open.some((q) => q.liveClash),
    };
  });
}

export async function getCompany(id: string): Promise<CompanySummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await getCompanies()).find((c) => c.id === id) ?? null;
}

/** Companies with open work first (soonest deadline first), then the rest by name. */
export function sortCompanies(list: CompanySummary[]): CompanySummary[] {
  return [...list].sort((a, b) => {
    if (a.open.length && !b.open.length) return -1;
    if (!a.open.length && b.open.length) return 1;
    if (a.nearest !== b.nearest) {
      if (!a.nearest) return 1;
      if (!b.nearest) return -1;
      return a.nearest < b.nearest ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
