import "server-only";
// Background reviews (L-7): the server runs a review step by step, each step in its own function invocation, so a
// review keeps going after the browser tab closes. Each invocation claims a short lease on the review row, runs
// exactly one step (or one part of a long step), releases the lease and asks the server to run the next step.
// The lease makes "kicking" always safe: a second runner for the same review simply finds it busy. A stalled chain
// (a lost request, a cold start that timed out) is picked up again by the status endpoint's watchdog.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { reviews } from "@/lib/db/schema";
import { resumePoint, type PipelineStep } from "@/lib/ux/resume";
import { runBundle, runChecks, runClash, runExtract, runFinalize, runScan } from "./reviews";

/** Longer than one step's time budget (STEP_BUDGET_MS) plus the AI call in flight, shorter than maxDuration. */
const LEASE_SECONDS = 280;
export { INTERRUPTED_MS, isInterrupted, isStalled, STALL_MS } from "@/lib/ux/runState";

const RUNNERS: Record<PipelineStep, (reviewId: string) => Promise<unknown>> = {
  extract: runExtract,
  checks: runChecks,
  clash: runClash,
  scan: runScan,
  bundle: runBundle,
  finalize: runFinalize,
};

/** A secret only this deployment knows, so outsiders can't trigger steps directly. */
export function driveSecret(): string {
  const parts = [process.env.DRIVE_SECRET, process.env.ACCESS_CODE, process.env.DATABASE_URL, process.env.ANTHROPIC_API_KEY].map((v) => v ?? "");
  return createHash("sha256").update(`atliq-drive:${parts.join("|")}`).digest("hex");
}

/** The origin the visitor used (the production alias on Vercel), so chained calls stay on an unprotected domain. */
export function originOf(headers: Headers, fallbackUrl?: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return fallbackUrl ? new URL(fallbackUrl).origin : "http://localhost:3000";
}

async function claim(reviewId: string): Promise<boolean> {
  const rows = await getSql()`
    update reviews set lease_until = now() + make_interval(secs => ${LEASE_SECONDS})
    where id = ${reviewId} and status = 'running' and (lease_until is null or lease_until < now())
    returning id`;
  return rows.length > 0;
}

async function release(reviewId: string): Promise<void> {
  await getDb().update(reviews).set({ leaseUntil: null }).where(eq(reviews.id, reviewId));
}

/** How many background reviews may run at once (AI provider rate limits); the rest wait as "queued". */
export function concurrency(): number {
  const n = Number(process.env.BACKGROUND_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

/** Reviews actively running (made progress in the last 10 minutes). */
async function activeCount(excludeId?: string): Promise<number> {
  const rows = await getSql()<{ n: number }[]>`
    select count(*)::int as n from reviews
    where status = 'running' and coalesce(progress_at, started_at) > now() - interval '10 minutes'
      and (${excludeId ?? null}::uuid is null or id <> ${excludeId ?? null}::uuid)`;
  return rows[0]?.n ?? 0;
}

/** Start a freshly masked review now if a slot is free; otherwise queue it. */
export async function startOrQueue(reviewId: string, origin: string): Promise<"started" | "queued"> {
  if ((await activeCount(reviewId)) >= concurrency()) {
    await getDb().update(reviews).set({ status: "queued" }).where(and(eq(reviews.id, reviewId), eq(reviews.status, "running")));
    return "queued";
  }
  await kick(reviewId, origin);
  return "started";
}

/** Move the oldest queued reviews into free slots and start them. Safe to call any time (watchdog). */
export async function promoteQueued(origin: string): Promise<number> {
  const free = concurrency() - (await activeCount());
  if (free <= 0) return 0;
  const rows = await getSql()<{ id: string }[]>`
    update reviews set status = 'running', progress_at = now(), lease_until = null
    where id in (select id from reviews where status = 'queued' order by started_at limit ${free} for update skip locked)
    returning id`;
  for (const r of rows) await kick(r.id, origin);
  return rows.length;
}

export type DriveResult = "more" | "finished" | "stopped" | "busy";

/** Run exactly one step (or one part of a resumable step) of a running review. */
export async function driveOnce(reviewId: string): Promise<DriveResult> {
  if (!(await claim(reviewId))) return "busy";
  try {
    const [r] = await getDb().select({ step: reviews.step, status: reviews.status }).from(reviews).where(eq(reviews.id, reviewId));
    if (!r || r.status !== "running") return "stopped";
    const next = resumePoint(r.step);
    if (!next) return "stopped";
    // A failing step marks the review failed itself (fail closed); there is nothing more to run.
    await RUNNERS[next](reviewId);
    const [after] = await getDb().select({ status: reviews.status }).from(reviews).where(eq(reviews.id, reviewId));
    return after?.status === "done" ? "finished" : after?.status === "running" ? "more" : "stopped";
  } catch {
    return "stopped";
  } finally {
    await release(reviewId);
  }
}

/** Ask the server to run the next step in a fresh invocation. Never throws; a lost kick is healed by the watchdog. */
export async function kick(reviewId: string, origin: string): Promise<void> {
  try {
    await fetch(`${origin}/api/reviews/${reviewId}/drive`, { method: "POST", headers: { "x-atliq-drive": driveSecret() }, cache: "no-store" });
  } catch {
    /* healed by the watchdog */
  }
}
