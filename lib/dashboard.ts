// Dashboard rules (S1), pure so the cards, numbers and charts are tested and always agree with the queue.
import { daysBetween } from "./checks/dates";
import type { BandName, QueueRow } from "./queue";

const RANK: Record<BandName, number> = { High: 3, Medium: 2, Low: 1 };
const open = (r: QueueRow) => !r.decision;

/**
 * The one decision that matters most: a reviewed, undecided contract with the soonest client deadline, the riskiest
 * first when deadlines tie. Undated contracts come last.
 */
export function decideCard(rows: QueueRow[]): QueueRow | null {
  const c = rows.filter((r) => open(r) && r.reviewState === "done");
  c.sort((a, b) => {
    // A deal owner who asked for a quick decision goes first.
    if (!!a.decisionRequestedBy !== !!b.decisionRequestedBy) return a.decisionRequestedBy ? -1 : 1;
    if (a.deadline !== b.deadline) {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    }
    return (b.band ? RANK[b.band] : 0) - (a.band ? RANK[a.band] : 0);
  });
  return c[0] ?? null;
}

/** First reviews overdue or due by tomorrow, most overdue first. */
export function reviewsToChase(rows: QueueRow[], today: string): QueueRow[] {
  return rows
    .filter((r) => open(r) && r.reviewer && r.reviewDeadline && daysBetween(today, r.reviewDeadline) <= 1)
    .sort((a, b) => (a.reviewDeadline! < b.reviewDeadline! ? -1 : a.reviewDeadline! > b.reviewDeadline! ? 1 : 0));
}

/** Contracts nobody is reviewing yet, soonest client deadline first. Freelancer and agency documents are left out. */
export function toAssign(rows: QueueRow[]): QueueRow[] {
  return rows
    .filter((r) => open(r) && !r.reviewer && r.direction === "atliq_supplier")
    .sort((a, b) => {
      if (a.deadline === b.deadline) return a.title.localeCompare(b.title);
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    });
}

export type WeekBar = { label: string; start: string; High: string[]; Medium: string[]; Low: string[]; "Not reviewed": string[] };

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const short = (iso: string) => `${+iso.slice(8, 10)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+iso.slice(5, 7) - 1]}`;

/** Client deadlines in the next `weeks` weeks from today, stacked by risk band. Overdue ones count in week one. */
export function dueByWeek(rows: QueueRow[], today: string, weeks = 5): WeekBar[] {
  const out: WeekBar[] = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(today, i * 7);
    return { label: short(start), start, High: [], Medium: [], Low: [], "Not reviewed": [] };
  });
  for (const r of rows.filter((x) => open(x) && x.deadline)) {
    const w = Math.max(0, Math.floor(daysBetween(today, r.deadline!) / 7));
    if (w >= weeks) continue;
    out[w]![r.band ?? "Not reviewed"].push(r.companyName ?? r.counterparty);
  }
  return out;
}

export type Workload = { name: string; onTrack: string[]; overdue: string[] };

/** Open first reviews per person, with the overdue ones split out. People with none still appear (they have room). */
export function workload(rows: QueueRow[], people: string[], today: string): Workload[] {
  return people.map((name) => {
    const mine = rows.filter((r) => open(r) && r.reviewer === name);
    const late = mine.filter((r) => r.reviewDeadline && r.reviewDeadline < today);
    return { name, onTrack: mine.filter((r) => !late.includes(r)).map((r) => r.companyName ?? r.counterparty), overdue: late.map((r) => r.companyName ?? r.counterparty) };
  });
}

export type TrendPoint = { week: string; total: number; kept: number; pct: number | null };

/**
 * "Are Serious flags real?": of the Serious findings raised in each week, the share nobody dismissed as a false
 * alarm. Weeks with no Serious findings have no value (a gap, not zero).
 */
export function seriousTrend(items: { raisedOn: string; dismissed: boolean }[], today: string, weeks = 8): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(today, -7 * (i + 1) + 1);
    const end = addDays(today, -7 * i);
    const inWeek = items.filter((x) => x.raisedOn >= start && x.raisedOn <= end);
    const kept = inWeek.filter((x) => !x.dismissed).length;
    out.push({ week: short(start), total: inWeek.length, kept, pct: inWeek.length ? Math.round((kept / inWeek.length) * 100) : null });
  }
  return out;
}

/** Days early (+) or late (−) a finished first review was, against its review-by date. */
export function onTime(reviewDeadline: string, completedOn: string): number {
  return daysBetween(completedOn, reviewDeadline);
}
