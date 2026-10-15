// First-review hand-off (features 24, 25, 27): which findings a reviewer marks, when "Review done" unlocks, what the
// assign dialog warns about, how long a review should take, and where a counsel question stands. Pure.
import { daysBetween } from "@/lib/checks/dates";

export type Mark = "agree" | "disagree" | "question";
export type Markable = { id: string; severity: string; title: string; dismissed: boolean };
export type MarkRow = { findingId: string; mark: Mark; note: string | null };

/** Serious, Negotiable and Not sure items are marked; Minor items stay folded and dismissed ones are done. */
export const markList = <T extends Markable>(findings: T[]): T[] => findings.filter((f) => !f.dismissed && ["serious", "negotiable", "not_sure"].includes(f.severity));

export const needsNote = (m: Mark) => m === "disagree" || m === "question";
const noteOk = (r: MarkRow) => !needsNote(r.mark) || (r.note ?? "").trim().length >= 5;

export function markProgress(list: Markable[], marks: MarkRow[]) {
  const by = new Map(marks.map((m) => [m.findingId, m]));
  const marked = list.filter((f) => by.has(f.id)).length;
  const missingNotes = list.filter((f) => by.has(f.id) && !noteOk(by.get(f.id)!)).length;
  return { marked, total: list.length, left: list.length - marked, missingNotes };
}

/** "Review done" stays off until every finding is marked (with a note where needed) and, in a re-review, every
 * condition Karandeep set has been checked against the new version. */
export function canFinish(list: Markable[], marks: MarkRow[], conditions: { addressed: string | null }[] = []): { ok: boolean; why: string | null } {
  const p = markProgress(list, marks);
  if (p.left) return { ok: false, why: `${p.left} finding${p.left === 1 ? "" : "s"} to mark` };
  if (p.missingNotes) return { ok: false, why: `${p.missingNotes} mark${p.missingNotes === 1 ? " needs" : "s need"} a note (why you disagree, or your question)` };
  const open = conditions.filter((c) => !c.addressed).length;
  if (open) return { ok: false, why: `${open} of Karandeep's conditions still to check` };
  return { ok: true, why: null };
}

/** Agree on a Serious or Negotiable finding means "push back on this": those become the pushback list. */
export const pushbackFromMarks = (list: Markable[], marks: MarkRow[]) => {
  const agreed = new Set(marks.filter((m) => m.mark === "agree").map((m) => m.findingId));
  return list.filter((f) => agreed.has(f.id) && (f.severity === "serious" || f.severity === "negotiable"));
};

/** Two days before the client deadline, never before today; three days out when there is no deadline. */
export function defaultReviewBy(clientDeadline: string | null, today: string): string {
  const base = clientDeadline ? addDays(clientDeadline, -2) : addDays(today, 3);
  return base < today ? today : base;
}

export function assignWarnings(a: { reviewBy: string; clientDeadline: string | null; reviewer: string; owner: string | null; today: string; openReviews: number }): string[] {
  const w: string[] = [];
  if (a.reviewBy < a.today) w.push("This date is already past.");
  if (a.clientDeadline && a.reviewBy > a.clientDeadline) w.push("This date is after the client deadline. The review would arrive too late.");
  else if (a.clientDeadline && daysBetween(a.reviewBy, a.clientDeadline) < 1) w.push("That leaves no time between the review and the client deadline.");
  if (a.owner && a.reviewer === a.owner) w.push(`${a.reviewer} owns this deal. A second pair of eyes works better.`);
  if (a.openReviews >= 3) w.push(`${a.reviewer} already has ${a.openReviews} open reviews.`);
  return w;
}

// Minutes for a careful first review by document type, plus 15 minutes per Serious item.
const EST_BASE: Record<string, number> = { msa: 120, partnership: 120, baa: 90, dpa: 60, subcontract: 60, freelancer: 45, sow: 45, nda: 15, waiver: 20 };
export function estimateMinutes(docType: string, serious: number | null) {
  const base = EST_BASE[docType] ?? 60;
  const est = base + 15 * (serious ?? 0);
  return { est, basis: `${docType.toUpperCase()} baseline ${hm(base)}${serious ? ` + ${serious} Serious × 15m` : ""}${serious === null ? " · provisional until the AI review runs" : ""}` };
}

export function hm(m: number): string {
  const r = Math.round(m);
  if (r < 60) return `${r}m`;
  const h = Math.floor(r / 60), rest = r % 60;
  return rest ? `${h}h ${String(rest).padStart(2, "0")}m` : `${h}h`;
}

export type QuestionState = { key: "answered" | "overdue" | "soon" | "waiting"; label: string; tone: "okc" | "medium" | "neutral"; rank: number };

/** Where a counsel question stands against its answer-by date (APP_TODAY), or how late the answer came. */
export function questionStatus(q: { answerBy: string | null; answeredOn: string | null }, today: string): QuestionState {
  if (q.answeredOn) {
    const late = q.answerBy ? daysBetween(q.answerBy, q.answeredOn) : 0;
    return { key: "answered", label: late > 0 ? `Answered ${late} day${late === 1 ? "" : "s"} late` : "Answered on time", tone: late > 0 ? "medium" : "okc", rank: 4 };
  }
  if (!q.answerBy) return { key: "waiting", label: "Waiting · no date", tone: "neutral", rank: 3 };
  const d = daysBetween(today, q.answerBy);
  if (d < 0) return { key: "overdue", label: `Overdue · ${-d} day${d === -1 ? "" : "s"}`, tone: "medium", rank: 0 };
  if (d === 0) return { key: "soon", label: "Due today", tone: "medium", rank: 1 };
  if (d <= 2) return { key: "soon", label: d === 1 ? "Due tomorrow" : `Due in ${d} days`, tone: "neutral", rank: 2 };
  return { key: "waiting", label: "Waiting", tone: "neutral", rank: 3 };
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
