// POST /api/contracts/inspect — read a chosen file before upload: run the input gate early (so a duplicate, scan or
// non-English file is reported before the form is filled in) and prefill the deal details from the contract and
// the existing deals (Tesler's law). Nothing is stored and no AI is called.
import { NextResponse } from "next/server";
import { eq, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts, deals } from "@/lib/db/schema";
import { parseFile, IngestError } from "@/lib/ingest/parse";
import { runGate } from "@/lib/ingest/gate";
import { dealMatchKey, inspectContract } from "@/lib/ingest/inspect";
import { findContractByHash } from "@/lib/data/contracts";

import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { routeUser } from "@/lib/auth/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { response } = await routeUser("contract.upload");
  if (response) return response;
  const limit = rateLimit(`inspect:${clientIp(req)}`, 60, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec, "files");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });

  let text: string;
  try {
    text = (await parseFile(new Uint8Array(await file.arrayBuffer()), file.name)).text;
  } catch (err) {
    if (err instanceof IngestError) return NextResponse.json({ stopped: true, stop: err.code, message: err.message });
    throw err;
  }
  // Freelancer/subcontract documents can still be uploaded when linked to a deal, so that stop is only a warning.
  const gate = await runGate({ text, linkedToDeal: true, findByHash: findContractByHash });
  if (!gate.ok) return NextResponse.json({ stopped: true, stop: gate.stop, message: gate.message, duplicateOf: gate.duplicateOf ?? null });

  const guess = inspectContract(gate.text);
  let deal: { id: string; name: string; owner: string; clientDeadline: string | null } | null = null;
  if (guess.counterparty) {
    const key = dealMatchKey(guess.counterparty);
    if (key.length >= 4) {
      const [d] = await getDb()
        .select({ id: deals.id, name: deals.name, owner: deals.owner, clientDeadline: deals.clientDeadline })
        .from(deals)
        .where(ilike(deals.name, `%${key}%`));
      if (d) deal = d;
      else {
        const [c] = await getDb().select({ dealId: contracts.dealId }).from(contracts).where(ilike(contracts.counterparty, `%${key}%`));
        if (c?.dealId) {
          const [d2] = await getDb().select({ id: deals.id, name: deals.name, owner: deals.owner, clientDeadline: deals.clientDeadline }).from(deals).where(eq(deals.id, c.dealId));
          if (d2) deal = d2;
        }
      }
    }
  }
  return NextResponse.json({
    stopped: false,
    guess,
    clauseCount: gate.clauses.clauseCount,
    scheduleItemCount: gate.clauses.scheduleItemCount,
    sectionCount: gate.clauses.sectionCount,
    deal,
  });
}
