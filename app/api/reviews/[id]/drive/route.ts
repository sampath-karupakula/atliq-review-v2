// POST /api/reviews/[id]/drive — internal: run the next step of a background review, then chain the one after.
// Only the server itself calls this (it carries the deployment's drive secret). It answers at once (202) and does
// the work after the response, within this invocation's time limit.
import { after, NextResponse } from "next/server";
import { driveOnce, driveSecret, kick, originOf, promoteQueued } from "@/lib/data/driver";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (req.headers.get("x-atliq-drive") !== driveSecret()) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await ctx.params;
  const origin = originOf(req.headers, req.url);
  after(async () => {
    const r = await driveOnce(id);
    if (r === "more") await kick(id, origin);
    // A finished or stopped review frees a slot for the next queued one.
    else if (r === "finished" || r === "stopped") await promoteQueued(origin);
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
