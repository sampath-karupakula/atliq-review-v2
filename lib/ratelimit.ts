// Best-effort, per-instance rate limiting for the public demo (no login). Serverless instances don't share memory,
// so this slows abuse rather than guaranteeing a hard limit; the hard cost guard is the daily review budget
// (lib/data/budget.ts), which is counted in the database.

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

export type Limit = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): Limit {
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true };
  }
  if (w.count >= max) return { ok: false, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
  w.count += 1;
  return { ok: true };
}

/** The caller's IP from the proxy headers Vercel sets (falls back to "local"). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function tooMany(retryAfterSec: number, what: string): Response {
  const mins = Math.max(1, Math.round(retryAfterSec / 60));
  return Response.json(
    { failed: true, reason: "rate_limited", message: `Too many ${what} from this connection. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
