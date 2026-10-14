import "server-only";
import { getSql } from "@/lib/db/client";
import type { BandName, QueueRow, ReviewState } from "@/lib/queue";

// One row per open contract (received, not signed, not rejected), with its deal, company, latest incoming review,
// open Serious count, live clash and active assignment. The filter and sort rules live in lib/queue.ts.
type Raw = {
  id: string;
  title: string;
  counterparty: string;
  doc_type: string;
  direction: string;
  company_id: string | null;
  company_name: string | null;
  deal_id: string | null;
  owner: string | null;
  contract_owner: string | null;
  deadline: string | null;
  deadline_note: string | null;
  value_usd: string | null;
  currency: string | null;
  review_status: string | null;
  band: string | null;
  score: number | null;
  serious_open: number;
  live_clash: boolean;
  top_issue: string | null;
  reviewer: string | null;
  review_deadline: string | null;
};

const BANDS: BandName[] = ["High", "Medium", "Low"];

function toBand(v: string | null): BandName | null {
  if (!v) return null;
  return BANDS.find((b) => b.toLowerCase() === v.toLowerCase()) ?? null;
}

function toState(status: string | null): ReviewState {
  if (status === "done") return "done";
  if (status === "running") return "running";
  if (status === "queued") return "queued";
  if (status === "failed") return "failed";
  return "not_reviewed";
}

export async function getQueueRows(): Promise<QueueRow[]> {
  const sql = getSql();
  const rows = await sql<Raw[]>`
    select c.id, c.title, c.counterparty, c.doc_type, c.direction, c.company_id, co.name as company_name,
           c.deal_id, d.owner, c.owner as contract_owner, to_char(d.client_deadline, 'YYYY-MM-DD') as deadline,
           d.deadline_note, d.value_usd::text as value_usd, d.currency,
           r.status as review_status, r.band, r.score,
           coalesce(f.serious_open, 0)::int as serious_open, coalesce(f.live_clash, false) as live_clash, f.top_issue,
           a.reviewer, to_char(a.review_deadline, 'YYYY-MM-DD') as review_deadline
    from contracts c
    left join deals d on d.id = c.deal_id
    left join companies co on co.id = c.company_id
    left join lateral (
      select id, status, band, score from reviews
      where contract_id = c.id and kind = 'incoming'
      order by started_at desc limit 1
    ) r on true
    left join lateral (
      select
        count(*) filter (where severity = 'serious' and not dismissed and not accepted) as serious_open,
        bool_or("check" = 'clash' and severity = 'serious' and not dismissed) as live_clash,
        (array_agg(title order by case severity when 'serious' then 0 when 'negotiable' then 1 else 2 end, sort)
           filter (where not dismissed and severity in ('serious', 'negotiable')))[1] as top_issue
      from findings where review_id = r.id and r.status = 'done'
    ) f on true
    left join lateral (
      select reviewer, review_deadline from assignments
      where contract_id = c.id and status = 'assigned'
      order by created_at desc limit 1
    ) a on true
    where not c.is_signed and c.status <> 'rejected'`;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    counterparty: r.counterparty,
    docType: r.doc_type,
    direction: r.direction,
    companyId: r.company_id,
    companyName: r.company_name,
    dealId: r.deal_id,
    owner: r.owner ?? r.contract_owner,
    deadline: r.deadline,
    deadlineNote: r.deadline_note,
    valueUsd: r.value_usd === null ? null : Number(r.value_usd),
    currency: r.currency ?? "USD",
    reviewState: toState(r.review_status),
    band: r.review_status === "done" ? toBand(r.band) : null,
    score: r.review_status === "done" ? r.score : null,
    seriousOpen: r.serious_open,
    liveClash: r.live_clash,
    topIssue: r.top_issue,
    reviewer: r.reviewer,
    reviewDeadline: r.review_deadline,
  }));
}
