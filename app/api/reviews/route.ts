// POST /api/reviews { contractId } — create a review and run step 1 (mask + leak check, no AI yet), then hand the
// rest to the server: the review keeps running in the background and the browser only polls its status.
import { z } from "zod";
import { NextResponse } from "next/server";
import { createReview } from "@/lib/data/reviews";
import { step } from "@/lib/data/route";
import { originOf, startOrQueue } from "@/lib/data/driver";
import { logEvent } from "@/lib/data/audit";
import { authorize } from "@/lib/auth/session";
import { currentAssignment } from "@/lib/data/assignments";
import { authError } from "@/lib/auth/http";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ contractId: z.string().uuid() });

export async function POST(req: Request) {
  const limit = rateLimit(`review:${clientIp(req)}`, 10, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec, "reviews");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "contractId is required" }, { status: 400 });
  // An assigned contract is reviewed by its assignee (or an admin): tokens are spent on their schedule.
  let actor: string;
  try {
    const a = await currentAssignment(body.data.contractId);
    actor = (await authorize("review.start", { assignee: a?.reviewer ?? null })).name;
  } catch (e) {
    return authError(e);
  }
  const origin = originOf(req.headers, req.url);
  return step(async () => {
    const created = await createReview(body.data.contractId);
    const mode = await startOrQueue(created.reviewId, origin);
    await logEvent({ actor, action: "review.start", contractId: body.data.contractId, text: `Started a review${mode === "queued" ? " (queued)" : ""}` });
    return { ...created, mode };
  });
}
