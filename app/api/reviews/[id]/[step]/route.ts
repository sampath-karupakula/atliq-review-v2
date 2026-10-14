// POST /api/reviews/[id]/{extract|checks|clash|scan|bundle|finalize} — one pipeline step per request.
// extract and scan are resumable: call again while the response says { done: false }.
// POST /api/reviews/[id]/cancel stops a run (finished steps kept); /resume carries it on from the last saved step.
import { after, NextResponse } from "next/server";
import { cancelReview, resumeReview, runBundle, runChecks, runClash, runExtract, runFinalize, runScan } from "@/lib/data/reviews";
import { step } from "@/lib/data/route";
import { kick, originOf } from "@/lib/data/driver";
import { logEvent } from "@/lib/data/audit";
import { authorize } from "@/lib/auth/session";
import { currentAssignment } from "@/lib/data/assignments";
import { authError } from "@/lib/auth/http";
import { getDb } from "@/lib/db/client";
import { reviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function contractOf(reviewId: string): Promise<string | null> {
  const [r] = await getDb().select({ contractId: reviews.contractId }).from(reviews).where(eq(reviews.id, reviewId));
  return r?.contractId ?? null;
}

export const runtime = "nodejs";
export const maxDuration = 300;

const STEPS: Record<string, (id: string) => Promise<unknown>> = {
  extract: runExtract,
  checks: runChecks,
  clash: runClash,
  bundle: runBundle,
  scan: runScan,
  cancel: cancelReview,
  resume: resumeReview,
  finalize: async (id: string) => {
    const r = await runFinalize(id);
    // The completion screen shows the outcome (peak-end rule): band, score and the top one or two issues.
    const rank: Record<string, number> = { serious: 0, negotiable: 1 };
    const top = r.findings
      .filter((f) => f.severity in rank)
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, 2)
      .map((f) => ({ severity: f.severity, title: f.title }));
    return { done: true, score: r.score, band: r.band, counts: r.counts, coverageLine: r.coverageLine, top };
  },
};

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; step: string }> }) {
  const { id, step: name } = await ctx.params;
  const handler = STEPS[name];
  if (!handler) return NextResponse.json({ error: `Unknown step "${name}"` }, { status: 404 });
  // Running, stopping or resuming a review needs a role that can start reviews.
  let actor: string;
  try {
    const contractId = await contractOf(id);
    const a = contractId ? await currentAssignment(contractId) : null;
    actor = (await authorize("review.start", { assignee: a?.reviewer ?? null })).name;
  } catch (e) {
    return authError(e);
  }
  if (name === "resume") {
    // Resuming hands the review back to the background runner.
    const origin = originOf(_req.headers, _req.url);
    return step(async () => {
      const r = await resumeReview(id);
      after(() => kick(id, origin));
      await logEvent({ actor, action: "review.resume", contractId: await contractOf(id), text: `Resumed a review from “${r.next}”` });
      return r;
    });
  }
  if (name === "cancel") {
    return step(async () => {
      const r = await cancelReview(id);
      await logEvent({ actor, action: "review.cancel", contractId: await contractOf(id), text: "Stopped a review" });
      return r;
    });
  }
  return step(() => handler(id));
}
