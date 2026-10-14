// The contract queue's rules: one row per open contract, filtered by the chips and sorted by client deadline, then
// risk. Pure, so the dashboard numbers, the filter chips and the table always agree.
import { daysBetween } from "./checks/dates";

export type BandName = "High" | "Medium" | "Low";
export type ReviewState = "not_reviewed" | "queued" | "running" | "done" | "failed";

export type QueueRow = {
  id: string;
  title: string;
  counterparty: string;
  docType: string;
  direction: string;
  companyId: string | null;
  companyName: string | null;
  dealId: string | null;
  owner: string | null;
  deadline: string | null;
  deadlineNote: string | null;
  valueUsd: number | null;
  currency: string;
  reviewState: ReviewState;
  band: BandName | null;
  score: number | null;
  seriousOpen: number;
  liveClash: boolean;
  topIssue: string | null;
  reviewer: string | null;
  reviewDeadline: string | null;
};

export const QUEUE_FILTERS = [
  ["all", "All open"],
  ["week", "Due in 7 days"],
  ["serious", "Serious items open"],
  ["high", "High risk"],
  ["clash", "Clashes"],
  ["norev", "No reviewer"],
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number][0];

export function isQueueFilter(v: unknown): v is QueueFilter {
  return QUEUE_FILTERS.some(([k]) => k === v);
}

const BAND_RANK: Record<BandName, number> = { High: 3, Medium: 2, Low: 1 };

/** Days to the client deadline from `today`, or null when the deal has no date. */
export function daysLeft(row: Pick<QueueRow, "deadline">, today: string): number | null {
  return row.deadline ? daysBetween(today, row.deadline) : null;
}

export function matchesFilter(row: QueueRow, f: QueueFilter, today: string): boolean {
  switch (f) {
    case "all":
      return true;
    case "week": {
      const d = daysLeft(row, today);
      return d !== null && d <= 7;
    }
    case "serious":
      return row.seriousOpen > 0;
    case "high":
      return row.band === "High";
    case "clash":
      return row.liveClash;
    case "norev":
      return !row.reviewer;
  }
}

export function matchesSearch(row: QueueRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [row.title, row.counterparty, row.companyName, row.owner, row.reviewer]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(s);
}

/** Soonest client deadline first (no date last), then higher risk, then title. */
export function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.deadline !== b.deadline) {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    }
    const r = (b.band ? BAND_RANK[b.band] : 0) - (a.band ? BAND_RANK[a.band] : 0);
    return r || a.title.localeCompare(b.title);
  });
}

export function filterQueue(rows: QueueRow[], f: QueueFilter, q: string, today: string): QueueRow[] {
  return sortQueue(rows.filter((r) => matchesFilter(r, f, today) && matchesSearch(r, q)));
}

export function filterCounts(rows: QueueRow[], today: string): Record<QueueFilter, number> {
  const out = {} as Record<QueueFilter, number>;
  for (const [k] of QUEUE_FILTERS) out[k] = rows.filter((r) => matchesFilter(r, k, today)).length;
  return out;
}

/** Plain deadline wording: "3 days overdue", "today", "tomorrow", "in 12 days". */
export function deadlineWords(days: number | null): string {
  if (days === null) return "No date given";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
