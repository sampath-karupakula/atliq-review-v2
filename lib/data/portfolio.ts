import "server-only";
import { getSql } from "@/lib/db/client";
import { appToday } from "@/lib/config";

// Signed contracts on file, with whether they are still in force on APP_TODAY. Exposures inside them come from the
// portfolio scan in P8; until then each row says what the document is and when it ends.
export type SignedRow = {
  id: string;
  title: string;
  counterparty: string;
  docType: string;
  companyId: string | null;
  companyName: string | null;
  signedDate: string | null;
  ends: string | null;
  inForce: boolean;
  promises: string[];
  sourceFile: string | null;
};

export async function getSignedContracts(): Promise<SignedRow[]> {
  const sql = getSql();
  const today = appToday();
  const rows = await sql<
    {
      id: string;
      title: string;
      counterparty: string;
      doc_type: string;
      company_id: string | null;
      company_name: string | null;
      signed_date: string | null;
      ends: string | null;
      promises: string[] | null;
      source_file: string | null;
    }[]
  >`
    select c.id, c.source_file, c.title, c.counterparty, c.doc_type, c.company_id, co.name as company_name,
           to_char(c.signed_date, 'YYYY-MM-DD') as signed_date, to_char(c.ends, 'YYYY-MM-DD') as ends,
           (select array_agg(m.id order by m.id) from commitments m where m.contract_id = c.id) as promises
    from contracts c left join companies co on co.id = c.company_id
    where c.is_signed
    order by c.signed_date desc nulls last`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    counterparty: r.counterparty,
    docType: r.doc_type,
    companyId: r.company_id,
    companyName: r.company_name,
    signedDate: r.signed_date,
    ends: r.ends,
    inForce: !r.ends || r.ends >= today,
    promises: r.promises ?? [],
    sourceFile: r.source_file,
  }));
}
