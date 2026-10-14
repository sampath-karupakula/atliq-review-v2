// All date maths runs here, from APP_TODAY. The AI never decides whether something is live.

export type CommitmentStatus = "live" | "expired" | "permanent";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function assertIso(d: string, what: string): void {
  if (!ISO.test(d)) throw new Error(`${what} must be YYYY-MM-DD, got "${d}"`);
}

/**
 * - ends < today → expired
 * - ends is null and the commitment is an IP assignment → permanent
 * - otherwise → live (a null end on a non-IP commitment is treated as still binding)
 */
export function commitmentStatus(c: { type: string; ends: string | null }, today: string): CommitmentStatus {
  assertIso(today, "today");
  if (c.ends === null) return c.type === "ip_assigned" ? "permanent" : "live";
  assertIso(c.ends, "ends");
  return c.ends < today ? "expired" : "live";
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  assertIso(from, "from");
  assertIso(to, "to");
  const ms = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** "28 Sep 2026" */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  assertIso(d, "date");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${+d.slice(8, 10)} ${months[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}

export type DeadlineState = { days: number; label: string; tone: "overdue" | "urgent" | "soon" | "ok" };

/** Days left to a deadline, with a plain label. Urgent = 3 days or fewer. */
export function deadlineState(deadline: string, today: string): DeadlineState {
  const days = daysBetween(today, deadline);
  if (days < 0) return { days, label: `${-days}d overdue`, tone: "overdue" };
  if (days === 0) return { days, label: "today", tone: "urgent" };
  if (days <= 3) return { days, label: `${days}d left`, tone: "urgent" };
  if (days <= 10) return { days, label: `${days}d left`, tone: "soon" };
  return { days, label: `${days}d left`, tone: "ok" };
}
