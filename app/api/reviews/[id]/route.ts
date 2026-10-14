// GET /api/reviews/[id] — the status of a review, polled by the browser while it runs in the background.
// Also the watchdog: a running review whose runner chain stalled is kicked again here.
import { after, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { findings, reviews } from "@/lib/db/schema";
import { countSeverities, scoreOf } from "@/lib/score/score";
import { isInterrupted, isStalled, kick, originOf, promoteQueued } from "@/lib/data/driver";
import { resumePoint } from "@/lib/ux/resume";
import type { Severity } from "@/lib/pipeline/types";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ failed: true, reason: "signed_out", message: "Your session has ended. Sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [r] = await getDb().select().from(reviews).where(eq(reviews.id, id));
  if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const origin = originOf(req.headers, req.url);
  if (isStalled(r)) after(() => kick(r.id, origin));
  if (r.status === "queued") after(() => promoteQueued(origin).then(() => undefined));

  let result = null;
  if (r.status === "done") {
    const rows = await getDb()
      .select({ severity: findings.severity, title: findings.title, dismissed: findings.dismissed })
      .from(findings)
      .where(eq(findings.reviewId, r.id))
      .orderBy(asc(findings.sort));
    const counts = countSeverities(rows.map((f) => ({ severity: f.severity as Severity, dismissed: f.dismissed })));
    const { score, band } = scoreOf(counts);
    const rank: Record<string, number> = { serious: 0, negotiable: 1 };
    const top = rows
      .filter((f) => !f.dismissed && f.severity in rank)
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, 2)
      .map((f) => ({ severity: f.severity, title: f.title }));
    result = { score, band, counts, top };
  }
  return NextResponse.json({
    id: r.id,
    status: r.status,
    step: r.step,
    error: r.error,
    startedAt: r.startedAt,
    progressAt: r.progressAt,
    interrupted: isInterrupted(r),
    resumable: r.status !== "done" && !!(r.artifacts as { state?: unknown })?.state && resumePoint(r.step) !== null,
    result,
  });
}
