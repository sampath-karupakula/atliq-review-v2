// POST /api/contracts/signed — add signed contracts in bulk (several `file` fields). Each is parsed, checked by the
// input gate (scanned, not English, AtliQ not a party, duplicate) and stored as signed. No AI is called. The
// response lists what happened to each file and the new coverage.
import { getMissingSigned } from "@/lib/data/memory";
import { NextResponse } from "next/server";
import { parseFile, IngestError } from "@/lib/ingest/parse";
import { runGate } from "@/lib/ingest/gate";
import { inspectContract } from "@/lib/ingest/inspect";
import { findContractByHash } from "@/lib/data/contracts";
import { bumpCoverage, storeSigned } from "@/lib/data/signed";
import { logEvent } from "@/lib/data/audit";
import { routeUser } from "@/lib/auth/http";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_FILES = 20;

type Outcome =
  | { file: string; ok: true; contractId: string; counterparty: string; docType: string; signedDate: string | null; clauses: number }
  | { file: string; ok: false; message: string; duplicateOf?: string | null };

export async function POST(req: Request) {
  const { user, response } = await routeUser("contract.upload");
  if (response || !user) return response!;
  const limit = rateLimit(`signed:${clientIp(req)}`, 10, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec, "uploads");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the files as multipart form data." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one signed contract." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });

  // One file uploaded from a placeholder fills that tracker row (signed date and expiry come from the tracker).
  const trackerId = String(form.get("tracker") ?? "");
  const tracker = trackerId && files.length === 1 ? ((await getMissingSigned()).find((t) => t.trackerId === trackerId) ?? null) : null;
  const results: Outcome[] = [];
  for (const file of files) {
    try {
      const parsed = await parseFile(new Uint8Array(await file.arrayBuffer()), file.name);
      // Freelancer and agency agreements are welcome here: they hold promises too.
      const gate = await runGate({ text: parsed.text, linkedToDeal: true, findByHash: findContractByHash });
      if (!gate.ok) {
        results.push({ file: file.name, ok: false, message: gate.message, duplicateOf: gate.duplicateOf ?? null });
        continue;
      }
      const guess = inspectContract(gate.text);
      const counterparty = guess.counterparty ?? file.name.replace(/\.[a-z]+$/i, "");
      const stored = await storeSigned({
        counterparty,
        title: gate.title,
        text: gate.text,
        hash: gate.hash,
        docType: gate.docType,
        clauses: gate.clauses,
        sourceFile: file.name,
        tracker,
      });
      results.push({ file: file.name, ok: true, contractId: stored.contractId, counterparty, docType: gate.docType, signedDate: stored.signedDate, clauses: gate.clauses.clauseCount });
    } catch (err) {
      const message = err instanceof IngestError ? err.message : "This file couldn't be read.";
      results.push({ file: file.name, ok: false, message });
    }
  }
  const added = results.filter((r) => r.ok).length;
  const coverage = added ? await bumpCoverage(added) : null;
  if (added) await logEvent({ actor: user.name, action: "signed.upload", text: `Added ${added} signed contract${added === 1 ? "" : "s"} to the register's sources` });
  return NextResponse.json({ results, added, coverage }, { status: added ? 201 : 422 });
}
