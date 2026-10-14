// When a background review needs help. Pure, so it is unit-tested and shared by the driver, the status endpoint
// and the pages.

/** A running review with no live lease and no progress for this long has lost its runner and is kicked again. */
export const STALL_MS = 45_000;
/** No progress at all for this long: shown as interrupted (resume or start over). */
export const INTERRUPTED_MS = 10 * 60_000;

type Run = { status: string; leaseUntil?: Date | null; progressAt: Date | null; startedAt: Date };

export function isStalled(r: Run, now = Date.now()): boolean {
  if (r.status !== "running") return false;
  if (r.leaseUntil && r.leaseUntil.getTime() > now) return false;
  return now - (r.progressAt ?? r.startedAt).getTime() > STALL_MS;
}

export function isInterrupted(r: Run, now = Date.now()): boolean {
  return r.status === "running" && now - (r.progressAt ?? r.startedAt).getTime() > INTERRUPTED_MS;
}
