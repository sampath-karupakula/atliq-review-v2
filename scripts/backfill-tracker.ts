// One-off for databases seeded before P8: stores the tracker's signed rows (app_meta "tracker_signed") without
// reseeding, so reviews already run are kept. `pnpm tsx scripts/backfill-tracker.ts`
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { parseCsv } from "./lib/csv";

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = parseCsv(readFileSync("Dataset/contract_tracker.csv", "utf8"))
    .filter((r) => r.status === "Signed")
    .map((r) => ({ trackerId: r.contract_id, counterparty: r.counterparty, docType: r.doc_type, signedDate: blank(r.signed_date), expiry: blank(r.expiry_date), valueUsd: r.value_usd ? Number(r.value_usd) : null, notes: r.notes ?? "" }));
  await sql`insert into app_meta (key, value) values ('tracker_signed', ${sql.json(rows)}) on conflict (key) do update set value = excluded.value`;
  console.log(`Stored ${rows.length} signed tracker rows`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
