import "server-only";
// Signed contracts added in bulk (feature 16): each becomes part of what reviews are checked against, and the
// coverage line ("Checked against N of 30 signed contracts") moves up. No AI runs here; promises inside them are
// found by the portfolio scan (P8).
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appMeta, contracts } from "@/lib/db/schema";
import type { DocType } from "@/lib/ingest/doctype";
import type { ClauseMap } from "@/lib/ingest/clauses";
import { assignCompanies } from "./companies";
import { getCoverage, type Coverage } from "./register";

/** First date written like "15 March 2025", "March 15, 2025" or "2025-03-15" after a signing or effective-date phrase. */
export function findSignedDate(text: string): string | null {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const near = text.match(/(?:dated|effective date|signed on|executed on|made on|entered into on)[^\n]{0,40}?(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+,? \d{4}|[A-Za-z]+ \d{1,2},? \d{4})/i);
  if (!near) return null;
  const raw = near[1]!;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const a = raw.match(/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+),? (\d{4})$/);
  const b = raw.match(/^([A-Za-z]+) (\d{1,2}),? (\d{4})$/);
  const [d, m, y] = a ? [a[1], a[2], a[3]] : b ? [b[2], b[1], b[3]] : [null, null, null];
  const mi = m ? months.indexOf(m.toLowerCase()) : -1;
  if (!d || !y || mi < 0) return null;
  return `${y}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function storeSigned(args: {
  counterparty: string;
  title: string;
  text: string;
  hash: string;
  docType: DocType;
  clauses: ClauseMap;
  sourceFile: string;
}): Promise<{ contractId: string; signedDate: string | null }> {
  const signedDate = findSignedDate(args.text);
  const [row] = await getDb()
    .insert(contracts)
    .values({
      title: args.title,
      counterparty: args.counterparty,
      docType: args.docType,
      status: "signed",
      isSigned: true,
      signedDate,
      sourceFile: args.sourceFile,
      text: args.text,
      textHash: args.hash,
      clauseCount: args.clauses.clauseCount,
      scheduleItemCount: args.clauses.scheduleItemCount,
    })
    .returning({ id: contracts.id });
  return { contractId: row!.id, signedDate };
}

/** Count `added` more signed contracts as on file. The tracker total grows too if the files outnumber it. */
export async function bumpCoverage(added: number): Promise<Coverage> {
  const c = await getCoverage();
  const onFile = c.onFile + added;
  const next = { onFile, signedInTracker: Math.max(c.signedInTracker, onFile) };
  await getDb().update(appMeta).set({ value: next }).where(eq(appMeta.key, "coverage"));
  await assignCompanies();
  return next;
}
