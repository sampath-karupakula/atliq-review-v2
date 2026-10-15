// Loads seed/*.json and the capstone Dataset into Postgres. Idempotent: truncates first. Ported from the first build.
// Usage: pnpm seed
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { sql as dsql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { textHash, normaliseText } from "@/lib/ingest/hash";
import { countNumberedClauses, countScheduleItems } from "@/lib/ingest/clauses";
import { parseCsv } from "./lib/csv";
import { seedUsers } from "./seed-users";
import { assignCompanies } from "@/lib/data/companies";
import { companyKey } from "@/lib/companies";

const ROOT = process.cwd();
const readJson = <T>(p: string): T => JSON.parse(readFileSync(path.join(ROOT, p), "utf8")) as T;
const readText = (p: string): string => normaliseText(readFileSync(path.join(ROOT, p), "utf8"));

// The register coverage line: 17 signed files are on record, out of 30 signed in the tracker (ROADMAP §10).
export const COVERAGE = { onFile: 17, signedInTracker: 30 };

type DocType = (typeof s.contracts.$inferInsert)["docType"];

/** The tracker has no file column, so files are mapped to tracker rows by hand. */
const SIGNED: { file: string; tracker: string; docType: DocType; title: string; direction?: string }[] = [
  { file: "2022-07-01_orbit_travels_msa_scanned.md", tracker: "C-001", docType: "msa", title: "Orbit Travels — MSA (scanned)" },
  { file: "2024-08-01_crestline_retail_msa.md", tracker: "C-002", docType: "msa", title: "Crestline Retail — MSA" },
  { file: "2025-01-22_al_noor_mutual_nda.md", tracker: "C-013", docType: "nda", title: "Al Noor Hospitality — Mutual NDA" },
  { file: "2025-01-22_paytrack_technologies_msa.md", tracker: "C-005", docType: "msa", title: "PayTrack Technologies — MSA" },
  { file: "2025-03-10_acme_retail_group_msa.md", tracker: "C-006", docType: "msa", title: "Acme Retail Group — MSA" },
  { file: "2025-03-15_al_noor_hospitality_msa.md", tracker: "C-007", docType: "msa", title: "Al Noor Hospitality — MSA" },
  { file: "2025-04-18_sunrise_foods_msa.md", tracker: "C-008", docType: "msa", title: "Sunrise Foods — MSA" },
  { file: "2025-04-28_rohan_iyer_contractor_agreement.md", tracker: "C-039", docType: "freelancer", title: "Rohan Iyer — Contractor Agreement", direction: "atliq_buyer" },
  { file: "2025-06-20_northwind_logistics_msa.md", tracker: "C-009", docType: "msa", title: "Northwind Logistics — MSA (+ SOW-1)" },
  { file: "2025-09-01_cloudspan_strategic_partnership_agreement.md", tracker: "C-032", docType: "partnership", title: "CloudSpan Technologies — Partnership Agreement" },
  { file: "2025-10-06_atliq_intercompany_subcontractor_baa.md", tracker: "C-044", docType: "baa", title: "AtliQ intercompany — Subcontractor BAA", direction: "atliq_buyer" },
  { file: "2025-10-06_carebridge_clinics_baa.md", tracker: "C-043", docType: "baa", title: "CareBridge Clinics — BAA" },
  { file: "2025-11-28_brightwater_insurance_msa.md", tracker: "C-014", docType: "msa", title: "Brightwater Insurance — MSA" },
  { file: "2026-02-10_al_noor_waiver_letter.md", tracker: "C-016", docType: "waiver", title: "Al Noor — Waiver letter (Seaside)" },
  { file: "2026-07-16_meridian_healthcare_nda.md", tracker: "C-020", docType: "nda", title: "Meridian Healthcare — NDA" },
  { file: "2026-08-15_trustline_nbfc_msa.md", tracker: "C-021", docType: "msa", title: "Trustline NBFC — MSA" },
  { file: "2026-08-20_harrington_health_mutual_nda.md", tracker: "C-045", docType: "nda", title: "Harrington Health — Mutual NDA" },
];

const INCOMING: { file: string; tracker: string; docType: DocType; title: string; counterparty: string; direction?: string }[] = [
  { file: "2026-09-10_harrington_health_msa_draft.md", tracker: "C-023", docType: "msa", title: "Harrington Health — Master Professional Services Agreement", counterparty: "Harrington Health Systems, Inc." },
  { file: "2026-09-15_travelhub_services_agreement_draft.md", tracker: "C-024", docType: "msa", title: "TravelHub — Software Development and Services Agreement", counterparty: "TravelHub FZ-LLC" },
  { file: "2026-09-16_harrington_health_baa_draft.md", tracker: "C-046", docType: "baa", title: "Harrington Health — BAA (Exhibit D)", counterparty: "Harrington Health Systems, Inc." },
  { file: "2026-09-18_gulf_crown_hotels_msa_draft.md", tracker: "C-025", docType: "msa", title: "Gulf Crown Hotels & Resorts — MSA", counterparty: "Gulf Crown Hotels & Resorts Co." },
  { file: "2026-09-19_lakeshore_grocers_msa_draft.md", tracker: "C-026", docType: "msa", title: "Lakeshore Grocers — MSA + rate card", counterparty: "Lakeshore Grocers Inc." },
  { file: "2026-09-21_blueorchid_hotels_pilot_agreement_draft.md", tracker: "C-027", docType: "msa", title: "BlueOrchid Hotels — Pilot Services Agreement", counterparty: "BlueOrchid Hotels Pvt Ltd" },
  { file: "2026-09-23_rheinwerk_analytics_services_agreement_draft.md", tracker: "C-028", docType: "msa", title: "Rheinwerk Analytics — Services Agreement", counterparty: "Rheinwerk Analytics GmbH" },
  { file: "2026-09-24_datavane_strategic_partnership_agreement_draft.md", tracker: "C-035", docType: "partnership", title: "Datavane — Strategic Partnership Agreement", counterparty: "Datavane, Inc." },
  { file: "2026-09-24_sunrise_foods_sow2_draft.md", tracker: "C-029", docType: "sow", title: "Sunrise Foods — SOW No. 2", counterparty: "Sunrise Foods Pvt Ltd" },
  { file: "2026-09-25_finserve_capital_mutual_nda_draft.md", tracker: "C-036", docType: "nda", title: "FinServe Capital — Mutual NDA", counterparty: "FinServe Capital Private Limited" },
  { file: "2026-09-26_kriti_data_labs_subcontractor_agreement_draft.md", tracker: "C-037", docType: "subcontract", title: "Kriti Data Labs — Subcontractor Services Agreement", counterparty: "Kriti Data Labs", direction: "atliq_buyer" },
  { file: "2026-09-27_daniel_ortiz_contractor_agreement_draft.md", tracker: "C-047", docType: "freelancer", title: "Daniel Ortiz — Independent Contractor Agreement", counterparty: "Daniel Ortiz", direction: "atliq_buyer" },
  { file: "2026-09-27_daniel_ortiz_nda_draft.md", tracker: "C-048", docType: "nda", title: "Daniel Ortiz — Mutual NDA", counterparty: "Daniel Ortiz", direction: "atliq_buyer" },
  { file: "2026-09-27_loopmart_mutual_nda_draft.md", tracker: "C-038", docType: "nda", title: "LoopMart — Mutual NDA", counterparty: "LoopMart Retail Private Limited" },
  { file: "2026-09-27_marcus_reed_contractor_agreement_draft.md", tracker: "C-040", docType: "freelancer", title: "Marcus Reed — Independent Contractor Agreement", counterparty: "Marcus Reed", direction: "atliq_buyer" },
];

/**
 * Deals for the incoming drafts. Deadlines are read from the tracker notes by hand and the note is kept
 * so the UI can show where the date came from.
 */
const DEALS: {
  key: string;
  name: string;
  owner: string;
  valueUsd: number | null;
  currency?: string;
  domain: string;
  clientCountry: string;
  dataTouchers: string[];
  clientDeadline: string | null;
  deadlineNote: string;
  flow?: "new" | "upsell";
  parentContract?: string;
  personalData?: boolean;
  phi?: boolean;
  docs: { tracker: string; role: string }[];
}[] = [
  {
    key: "harrington", name: "Harrington Health — Clinical Analytics Platform", owner: "Dhaval", valueUsd: 210000,
    domain: "healthcare analytics", clientCountry: "USA", dataTouchers: ["AtliQ Pune team", "Daniel Ortiz (US freelancer)"],
    clientDeadline: "2026-10-01", deadlineNote: "C-023: need by 1 Oct (Rebecca)", personalData: true, phi: true,
    docs: [
      { tracker: "C-023", role: "client_contract" },
      { tracker: "C-046", role: "baa" },
      { tracker: "C-045", role: "nda" },
      { tracker: "C-047", role: "freelancer" },
      { tracker: "C-048", role: "freelancer_nda" },
    ],
  },
  {
    key: "travelhub", name: "TravelHub — Booking Platform", owner: "Karandeep", valueUsd: 52000,
    domain: "travel technology", clientCountry: "UAE", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: null, deadlineNote: "C-024: K to look this week (no date given)",
    docs: [{ tracker: "C-024", role: "client_contract" }],
  },
  {
    key: "gulfcrown", name: "Gulf Crown — Digital Transformation Programme", owner: "Bhavin", valueUsd: 140000,
    domain: "hospitality analytics", clientCountry: "Saudi Arabia", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: "2026-10-10", deadlineNote: "C-025: sign by 10 Oct!!",
    docs: [{ tracker: "C-025", role: "client_contract" }],
  },
  {
    key: "lakeshore", name: "Lakeshore Grocers — Data Engineering", owner: "Jay", valueUsd: 64000,
    domain: "retail data engineering / BI", clientCountry: "USA", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: "2026-10-03", deadlineNote: "C-026: by 3 Oct",
    docs: [{ tracker: "C-026", role: "client_contract" }],
  },
  {
    key: "blueorchid", name: "BlueOrchid Hotels — Guest Review Analytics Pilot", owner: "Jay", valueUsd: 38000,
    domain: "hospitality analytics", clientCountry: "India", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: "2026-10-05", deadlineNote: "C-027: by 5 Oct",
    docs: [{ tracker: "C-027", role: "client_contract" }],
  },
  {
    key: "rheinwerk", name: "Rheinwerk Analytics — Analytics Services", owner: "Bhavin", valueUsd: 96000, currency: "EUR",
    domain: "industrial analytics", clientCountry: "Germany", dataTouchers: ["AtliQ Pune team", "Kriti Data Labs (agency)"],
    clientDeadline: "2026-10-15", deadlineNote: "C-028: EUR 88k. by 15 Oct", personalData: true,
    docs: [
      { tracker: "C-028", role: "client_contract" },
      { tracker: "C-037", role: "subcontract" },
    ],
  },
  {
    key: "sunrise", name: "Sunrise Foods — SOW-2 Portal v2 + Dashboard", owner: "Dhaval", valueUsd: 45000,
    domain: "food supply-chain analytics", clientCountry: "India", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: "2026-10-08", deadlineNote: "C-029: by 8 Oct", flow: "upsell",
    parentContract: "Sunrise Foods MSA (signed 18 Apr 2025)",
    docs: [
      { tracker: "C-029", role: "sow" },
      { tracker: "C-008", role: "parent_msa" },
    ],
  },
  {
    key: "datavane", name: "Datavane — Global Partner Program", owner: "Bhavin", valueUsd: null,
    domain: "data platform partnerships", clientCountry: "USA", dataTouchers: [],
    clientDeadline: "2026-10-15", deadlineNote: "C-035: by 15 Oct",
    docs: [{ tracker: "C-035", role: "client_contract" }],
  },
  {
    key: "finserve", name: "FinServe Capital — NDA before data walkthrough", owner: "Karandeep", valueUsd: null,
    domain: "lending / fintech analytics", clientCountry: "India", dataTouchers: ["AtliQ Pune team"],
    clientDeadline: "2026-09-30", deadlineNote: "C-036: needed before 1 Oct data walkthrough",
    docs: [{ tracker: "C-036", role: "nda" }],
  },
  {
    key: "loopmart", name: "LoopMart — NDA", owner: "Jay", valueUsd: null,
    domain: "retail analytics", clientCountry: "India", dataTouchers: [],
    clientDeadline: null, deadlineNote: "C-038: no date given",
    docs: [{ tracker: "C-038", role: "nda" }],
  },
];

const COMMITMENT_SOURCE: Record<string, string> = {
  "CMT-001": "C-007",
  "CMT-002": "C-002",
  "CMT-003": "C-032",
  "CMT-004": "C-009",
  "CMT-005": "C-001",
};

type SeedCommitment = Record<string, unknown> & {
  id: string; type: string; contract: string; signed: string; entity: string; clauses: string[];
  binds_affiliates: boolean; activity: string; for_whom: string; territory: string[]; territory_rule?: string;
  domain: string; starts: string; ends: string | null; end_rule?: string; status: string; confirmed: boolean;
  waivers: string[]; quote: string;
};

const nullIfBlank = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);
const toNum = (v: string | undefined): number | null => (v && v.trim() && !isNaN(+v) ? +v : null);

async function main() {
  const db = getDb();
  const sql = getSql();
  const tracker = new Map(parseCsv(readFileSync(path.join(ROOT, "Dataset/contract_tracker.csv"), "utf8")).map((r) => [r.contract_id, r]));
  const row = (id: string) => {
    const r = tracker.get(id);
    if (!r) throw new Error(`Tracker row ${id} not found`);
    return r;
  };

  console.log("Truncating…");
  await db.execute(dsql`TRUNCATE notifications, assignments, ai_calls, masking_keys, findings, reviews,
    deal_notes, contract_links, deal_documents, contracts, deals, waivers, commitments, entities, entity_rules,
    clients, baseline_terms, positions, deal_rules, app_meta, audit_events, companies, offer_checks RESTART IDENTITY CASCADE`);
  // Accounts and sessions are kept: re-seeding the demo data never locks anyone out.

  // --- Reference data ---
  const ent = readJson<{ entities: Record<string, unknown>[]; rules: string[] }>("seed/entities.json");
  await db.insert(s.entities).values(
    ent.entities.map((e) => {
      const { id, legal_name, aliases, country, serves, default_law, ...extra } = e as Record<string, never>;
      return { id, legalName: legal_name, aliases, country, serves, defaultLaw: default_law, extra };
    }),
  );
  await db.insert(s.entityRules).values(ent.rules.map((text) => ({ text })));

  const clientsJson = readJson<{ clients: (typeof s.clients.$inferInsert)[] }>("seed/clients.json");
  await db.insert(s.clients).values(clientsJson.clients);

  const baseline = readJson<{ terms: Record<string, unknown>[] }>("seed/baseline.json");
  await db.insert(s.baselineTerms).values(
    baseline.terms.map((t) => {
      const { term, usual, count, source, exceptions, hard_line, ...extra } = t as Record<string, never>;
      return { term, usual, count: count ?? null, source: source ?? null, exceptions: exceptions ?? [], hardLine: hard_line ?? null, extra };
    }),
  );

  const pos = readJson<{ positions: (typeof s.positions.$inferInsert)[] }>("seed/positions.json");
  await db.insert(s.positions).values(pos.positions.map((p) => ({ ...p, confirmed: false })));

  const rules = readJson<{ rules: { id: string; when: string; requires: string[]; also?: string }[] }>("seed/deal_rules.json");
  await db.insert(s.dealRules).values(rules.rules.map(({ id, ...rule }) => ({ id, rule })));

  // --- Signed contracts ---
  const contractIdByTracker = new Map<string, string>();
  for (const c of SIGNED) {
    const r = row(c.tracker);
    const text = readText(`Dataset/signed_contracts/${c.file}`);
    const [inserted] = await db
      .insert(s.contracts)
      .values({
        trackerId: c.tracker,
        title: c.title,
        counterparty: r.counterparty,
        owner: nullIfBlank(r.requested_by),
        docType: c.docType,
        direction: c.direction ?? "atliq_supplier",
        status: "signed",
        isSigned: true,
        signedDate: nullIfBlank(r.signed_date),
        ends: nullIfBlank(r.expiry_date),
        sourceFile: `Dataset/signed_contracts/${c.file}`,
        text,
        textHash: textHash(text),
        clauseCount: countNumberedClauses(text),
        scheduleItemCount: countScheduleItems(text),
      })
      .returning({ id: s.contracts.id });
    contractIdByTracker.set(c.tracker, inserted.id);
  }

  // --- Register (commitments + waivers) ---
  const reg = readJson<{ commitments: SeedCommitment[]; waivers: Record<string, string>[] }>("seed/register.json");
  const now = new Date();
  await db.insert(s.commitments).values(
    reg.commitments.map((c) => {
      const {
        id, type, contract, signed, entity, clauses, binds_affiliates, activity, for_whom, territory, territory_rule,
        domain, starts, ends, end_rule, status, confirmed, waivers: _w, quote, ...extra
      } = c;
      void _w;
      return {
        id, type, contract, contractId: contractIdByTracker.get(COMMITMENT_SOURCE[id]) ?? null, signed, entity, clauses,
        bindsAffiliates: binds_affiliates, activity, forWhom: for_whom, territory, territoryRule: territory_rule ?? null,
        domain, starts, ends, endRule: end_rule ?? null, seededStatus: status,
        // Seeded as confirmed by Karandeep for the demo (ROADMAP §10).
        confirmed, confirmedBy: confirmed ? "Karandeep" : null, confirmedAt: confirmed ? now : null,
        quote, extra,
      };
    }),
  );
  await db.insert(s.waivers).values(
    reg.waivers.map((w) => ({
      id: w.id, commitmentId: w.commitment, source: w.source, dated: w.dated, scope: w.scope, excludes: w.excludes, quote: w.quote,
    })),
  );

  // --- Incoming drafts ---
  for (const c of INCOMING) {
    const r = row(c.tracker);
    const text = readText(`Dataset/incoming/${c.file}`);
    const [inserted] = await db
      .insert(s.contracts)
      .values({
        trackerId: c.tracker,
        title: c.title,
        counterparty: c.counterparty,
        owner: nullIfBlank(r.requested_by),
        docType: c.docType,
        direction: c.direction ?? "atliq_supplier",
        status: "received",
        sourceFile: `Dataset/incoming/${c.file}`,
        text,
        textHash: textHash(text),
        clauseCount: countNumberedClauses(text),
        scheduleItemCount: countScheduleItems(text),
      })
      .returning({ id: s.contracts.id });
    contractIdByTracker.set(c.tracker, inserted.id);
  }

  // --- Deals and bundles ---
  for (const d of DEALS) {
    const [deal] = await db
      .insert(s.deals)
      .values({
        name: d.name, owner: d.owner, valueUsd: d.valueUsd ?? toNum(row(d.docs[0].tracker).value_usd), currency: d.currency ?? "USD",
        domain: d.domain, clientCountry: d.clientCountry, dataTouchers: d.dataTouchers, clientDeadline: d.clientDeadline,
        deadlineNote: d.deadlineNote, flow: d.flow ?? "new", parentContract: d.parentContract ?? null,
        personalData: d.personalData ?? null, phi: d.phi ?? null,
      })
      .returning({ id: s.deals.id });
    for (const doc of d.docs) {
      const contractId = contractIdByTracker.get(doc.tracker);
      if (!contractId) throw new Error(`Deal ${d.key}: contract ${doc.tracker} not loaded`);
      await db.insert(s.dealDocuments).values({ dealId: deal.id, contractId, role: doc.role });
      // A signed parent MSA or NDA belongs to other history too; only incoming drafts get deal_id.
      if (!["parent_msa"].includes(doc.role) && !SIGNED.some((x) => x.tracker === doc.tracker)) {
        await db.update(s.contracts).set({ dealId: deal.id }).where(dsql`${s.contracts.id} = ${contractId}`);
      }
    }
  }

  const link = (from: string, to: string, kind: string) =>
    db.insert(s.contractLinks).values({ fromId: contractIdByTracker.get(from)!, toId: contractIdByTracker.get(to)!, kind });
  await link("C-046", "C-023", "exhibit_of"); // Harrington BAA is Exhibit D of the MSA
  await link("C-047", "C-023", "subcontract_for"); // Daniel Ortiz works on Harrington
  await link("C-048", "C-023", "subcontract_for");
  await link("C-037", "C-028", "subcontract_for"); // Kriti is the agency for Rheinwerk (RWA-2026-014)
  await link("C-029", "C-008", "sow_under"); // Sunrise SOW-2 under the signed Sunrise MSA

  await db.insert(s.appMeta).values([
    { key: "coverage", value: COVERAGE },
    { key: "seeded_at", value: now.toISOString() },
    {
      // Every signed row in the tracker; the ones with no file in the app show as placeholders on /exposure.
      key: "tracker_signed",
      value: [...tracker.values()]
        .filter((r) => r.status === "Signed")
        .map((r) => ({
          trackerId: r.contract_id,
          counterparty: r.counterparty,
          docType: r.doc_type,
          signedDate: nullIfBlank(r.signed_date),
          expiry: nullIfBlank(r.expiry_date),
          valueUsd: r.value_usd ? Number(r.value_usd) : null,
          notes: r.notes ?? "",
        })),
    },
  ]);

  const counts = await sql<{ t: string; n: number }[]>`
    select 'contracts' t, count(*)::int n from contracts union all
    select 'signed', count(*)::int from contracts where is_signed union all
    select 'incoming', count(*)::int from contracts where not is_signed union all
    select 'deals', count(*)::int from deals union all
    select 'commitments', count(*)::int from commitments union all
    select 'waivers', count(*)::int from waivers union all
    select 'clients', count(*)::int from clients union all
    select 'baseline_terms', count(*)::int from baseline_terms union all
    select 'positions', count(*)::int from positions union all
    select 'deal_rules', count(*)::int from deal_rules`;
  console.table(counts);
  const co = await assignCompanies(new Map([...tracker.values()].filter((r) => r.client_country).map((r) => [companyKey(r.counterparty), r.client_country])));
  console.log(`Companies: ${co.companies} (every contract assigned).`);
  // Demo accounts arrive with sign-in (P11).
  await seedUsers(db);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await getSql().end().catch(() => {});
  process.exit(1);
});
