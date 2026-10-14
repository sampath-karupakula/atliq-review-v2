// POST /api/contracts — upload → parse → clause split → input gate → store, and optionally assign who reviews it.
// No AI here: the review is started later by the assignee (or anyone allowed, if unassigned).
import { NextResponse } from "next/server";
import { parseFile, IngestError } from "@/lib/ingest/parse";
import { runGate } from "@/lib/ingest/gate";
import { findContractByHash, storeUpload, UploadDetails } from "@/lib/data/contracts";

import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { routeUser } from "@/lib/auth/http";
import { can } from "@/lib/auth/permissions";
import { createAssignment } from "@/lib/data/assignments";
import { isActiveUser } from "@/lib/data/people";

export const runtime = "nodejs";

function detailsFrom(form: FormData): unknown {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };
  const bool = (k: string) => (str(k) === undefined ? undefined : str(k) === "true" || str(k) === "on");
  return Object.fromEntries(
    Object.entries({
      counterparty: str("counterparty"),
      owner: str("owner"),
      valueUsd: str("valueUsd"),
      currency: str("currency"),
      domain: str("domain"),
      clientCountry: str("clientCountry"),
      deliveredFrom: str("deliveredFrom"),
      dataTouchers: str("dataTouchers")
        ?.split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      clientDeadline: str("clientDeadline"),
      personalData: bool("personalData"),
      phi: bool("phi"),
      direction: str("direction"),
      dealId: str("dealId"),
      docRole: str("docRole"),
      previousVersionId: str("previousVersionId"),
      parentContractId: str("parentContractId"),
    }).filter(([, v]) => v !== undefined),
  );
}

export async function POST(req: Request) {
  const { user, response } = await routeUser("contract.upload");
  if (response || !user) return response!;
  const limit = rateLimit(`upload:${clientIp(req)}`, 20, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec, "uploads");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  // Who reviews it, and by when (optional). Admins assign anyone; a reviewer can only take it themselves.
  const assignee = typeof form.get("assignee") === "string" ? String(form.get("assignee")).trim() : "";
  const reviewBy = typeof form.get("reviewBy") === "string" ? String(form.get("reviewBy")).trim() : "";
  const concerns = typeof form.get("concerns") === "string" ? String(form.get("concerns")).trim().slice(0, 2000) : "";
  if (assignee) {
    if (assignee !== user.name && !can(user, "review.assign")) {
      return NextResponse.json({ error: "Only an admin can assign a contract to someone else.", fields: [{ field: "assignee", message: "Assign it to yourself or leave it unassigned." }] }, { status: 403 });
    }
    if (!(await isActiveUser(assignee, ["admin", "reviewer"]))) {
      return NextResponse.json({ error: `${assignee} has no active reviewer account.`, fields: [{ field: "assignee", message: "Choose an active reviewer." }] }, { status: 422 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) {
      return NextResponse.json({ error: "Pick the date it should be reviewed by.", fields: [{ field: "reviewBy", message: "Pick a review-by date." }] }, { status: 422 });
    }
  }

  const details = UploadDetails.safeParse(detailsFrom(form));
  if (!details.success) {
    return NextResponse.json(
      { error: "Some deal details are missing.", fields: details.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }

  let parsed;
  try {
    parsed = await parseFile(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (err) {
    if (err instanceof IngestError) return NextResponse.json({ stopped: true, stop: err.code, message: err.message }, { status: 422 });
    throw err;
  }

  const gate = await runGate({
    text: parsed.text,
    linkedToDeal: Boolean(details.data.dealId),
    findByHash: findContractByHash,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { stopped: true, stop: gate.stop, message: gate.message, duplicateOf: gate.duplicateOf ?? null, docType: gate.docType ?? null },
      { status: gate.stop === "duplicate" ? 409 : 422 },
    );
  }

  const stored = await storeUpload({
    details: details.data,
    title: gate.title,
    text: gate.text,
    hash: gate.hash,
    docType: gate.docType,
    clauses: gate.clauses,
    sourceFile: file.name,
  });
  if (assignee) await createAssignment({ contractId: stored.contractId, reviewer: assignee, reviewDeadline: reviewBy, concerns, by: user.name });
  return NextResponse.json(
    {
      ...stored,
      assignee: assignee || null,
      reviewBy: assignee ? reviewBy : null,
      docType: gate.docType,
      title: gate.title,
      clauseCount: gate.clauses.clauseCount,
      scheduleItemCount: gate.clauses.scheduleItemCount,
      format: parsed.format,
    },
    { status: 201 },
  );
}
