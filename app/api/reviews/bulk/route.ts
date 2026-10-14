// POST /api/reviews/bulk { contractIds } — start reviews for several contracts (the queue's "Review all not
// reviewed"). Each is masked now; BACKGROUND_CONCURRENCY of them run at once and the rest wait as "queued".
// The daily review budget applies to each one.
import { z } from "zod";
import { NextResponse } from "next/server";
import { createReview, ReviewBusyError } from "@/lib/data/reviews";
import { BudgetError } from "@/lib/data/budget";
import { concurrency, originOf, startOrQueue } from "@/lib/data/driver";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { friendlyError } from "@/lib/ux/errors";
import { logEvent } from "@/lib/data/audit";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { currentAssignment } from "@/lib/data/assignments";
import { authError } from "@/lib/auth/http";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ contractIds: z.array(z.string().uuid()).min(1).max(25) });

export async function POST(req: Request) {
  let actor: string;
  let me;
  try {
    me = await authorize("contract.upload"); // any role that works on contracts; each one is checked below
    actor = me.name;
  } catch (e) {
    return authError(e);
  }
  const limit = rateLimit(`bulk:${clientIp(req)}`, 3, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec, "bulk reviews");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Send 1 to 25 contract ids." }, { status: 400 });
  const origin = originOf(req.headers, req.url);
  const started: string[] = [];
  const queued: string[] = [];
  const skipped: { contractId: string; reason: string }[] = [];
  for (const contractId of body.data.contractIds) {
    const a = await currentAssignment(contractId);
    if (!can(me, "review.start", { assignee: a?.reviewer ?? null })) {
      skipped.push({ contractId, reason: `Assigned to ${a?.reviewer}.` });
      continue;
    }
    try {
      const { reviewId } = await createReview(contractId);
      ((await startOrQueue(reviewId, origin)) === "started" ? started : queued).push(contractId);
    } catch (err) {
      if (err instanceof BudgetError) {
        skipped.push(...body.data.contractIds.slice(body.data.contractIds.indexOf(contractId)).map((id) => ({ contractId: id, reason: err.message })));
        break;
      }
      const reason = err instanceof ReviewBusyError ? "Already being reviewed." : friendlyError(err instanceof Error ? err.message : String(err)).title;
      skipped.push({ contractId, reason });
    }
  }
  await logEvent({ actor, action: "review.start", text: `Started ${started.length + queued.length} reviews in bulk${skipped.length ? ` (${skipped.length} skipped)` : ""}`, detail: { started, queued, skipped } });
  return NextResponse.json({ started, queued, skipped, concurrency: concurrency() });
}
