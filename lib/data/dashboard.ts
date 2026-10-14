import "server-only";
// What the dashboards read beyond the queue: the Serious-flag history for the trend, a reviewer's finished reviews for
// their track record, and the deals a person owns.
import { getSql } from "@/lib/db/client";

export async function seriousFlagHistory(): Promise<{ raisedOn: string; dismissed: boolean }[]> {
  const rows = await getSql()<{ raised_on: string; dismissed: boolean }[]>`
    select to_char(r.finished_at, 'YYYY-MM-DD') as raised_on, f.dismissed
    from findings f join reviews r on r.id = f.review_id
    where r.status = 'done' and r.kind = 'incoming' and f.severity = 'serious' and r.finished_at is not null`;
  return rows.map((r) => ({ raisedOn: r.raised_on, dismissed: r.dismissed }));
}

export type FinishedReview = { title: string; reviewDeadline: string; completedOn: string };

export async function finishedReviewsOf(person: string, limit = 6): Promise<FinishedReview[]> {
  const rows = await getSql()<{ title: string; review_deadline: string; completed_on: string }[]>`
    select coalesce(co.name, c.counterparty) as title, to_char(a.review_deadline, 'YYYY-MM-DD') as review_deadline,
           to_char(a.completed_at, 'YYYY-MM-DD') as completed_on
    from assignments a join contracts c on c.id = a.contract_id left join companies co on co.id = c.company_id
    where a.reviewer = ${person} and a.status = 'done' and a.completed_at is not null
    order by a.completed_at desc limit ${limit}`;
  return rows.map((r) => ({ title: r.title, reviewDeadline: r.review_deadline, completedOn: r.completed_on }));
}

export type OwnedDeal = { dealId: string; name: string; mainContractId: string | null; deadline: string | null; docs: number };

export async function dealsOwnedBy(person: string): Promise<OwnedDeal[]> {
  const rows = await getSql()<{ id: string; name: string; main: string | null; deadline: string | null; docs: number }[]>`
    select d.id, d.name, to_char(d.client_deadline, 'YYYY-MM-DD') as deadline,
      (select c.id from deal_documents dd join contracts c on c.id = dd.contract_id
        where dd.deal_id = d.id and not c.is_signed and dd.role not in ('freelancer', 'freelancer_nda', 'subcontract', 'parent_msa')
        order by c.version desc, c.created_at limit 1) as main,
      (select count(*)::int from deal_documents dd where dd.deal_id = d.id) as docs
    from deals d where d.owner = ${person}
    order by d.client_deadline nulls last, d.name`;
  return rows.map((r) => ({ dealId: r.id, name: r.name, mainContractId: r.main, deadline: r.deadline, docs: r.docs }));
}
