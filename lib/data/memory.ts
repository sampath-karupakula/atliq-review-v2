import "server-only";
// The signed contracts on file as search documents (feature 31), and the signed contracts the tracker lists that
// are not on file yet (placeholders with an upload prompt).
import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import { appMeta } from "@/lib/db/schema";
import { appToday } from "@/lib/config";
import type { SearchDoc } from "@/lib/memory/search";

export async function getSearchDocs(): Promise<SearchDoc[]> {
  const today = appToday();
  const rows = await getSql()<{ id: string; title: string; counterparty: string; signed_date: string | null; ends: string | null; text: string }[]>`
    select id, title, counterparty, to_char(signed_date, 'YYYY-MM-DD') as signed_date, to_char(ends, 'YYYY-MM-DD') as ends, text
    from contracts where is_signed order by signed_date desc nulls last`;
  return rows.map((r) => ({ id: r.id, title: r.title, counterparty: r.counterparty, signedDate: r.signed_date, inForce: !r.ends || r.ends >= today, text: r.text }));
}

export type TrackerSigned = { trackerId: string; counterparty: string; docType: string; signedDate: string | null; expiry: string | null; valueUsd: number | null; notes: string };

/** Tracker rows marked Signed whose file is not in the app (no contract carries their tracker id). */
export async function getMissingSigned(): Promise<TrackerSigned[]> {
  const [meta] = await getDb().select().from(appMeta).where(eq(appMeta.key, "tracker_signed"));
  const all = (meta?.value as TrackerSigned[] | undefined) ?? [];
  const onFile = await getSql()<{ tracker_id: string }[]>`select tracker_id from contracts where is_signed and tracker_id is not null`;
  const have = new Set(onFile.map((r) => r.tracker_id));
  return all.filter((t) => !have.has(t.trackerId));
}
