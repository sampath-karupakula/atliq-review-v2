// Portfolio check (O23): runs the review pipeline over the 17 signed contracts on file and writes
// data/exposure.json for the /exposure page (committed, so production needs no AI run).
// Usage: pnpm portfolio            (all 17, three at a time)
//        pnpm portfolio Brightwater (only files whose name contains the word)
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runReview } from "@/lib/pipeline/runReview";
import { referenceFromSeed } from "@/lib/reference/load";
import type { DealContext, Reference } from "@/lib/reference/types";
import type { ReviewReport } from "@/lib/pipeline/types";
import { aiConfig } from "@/lib/config";

const ROOT = process.cwd();
const SIGNED_DIR = path.join(ROOT, "Dataset/signed_contracts");

type Signed = {
  file: string;
  tracker: string;
  title: string;
  counterparty: string;
  valueUsd: number | null;
  country: string;
  domain: string;
  direction?: "atliq_buyer";
  /** Commitments that come FROM this contract are excluded (a contract cannot clash with itself). */
  own?: string[];
  /** Linked documents for pass-down checks (Rohan Iyer's freelancer agreement vs the Acme MSA). */
  linked?: { file: string; title: string; docType: string; role: string }[];
};

const SIGNED: Signed[] = [
  { file: "2022-07-01_orbit_travels_msa_scanned.md", tracker: "C-001", title: "Orbit Travels — MSA (scanned)", counterparty: "Orbit Travels Pvt Ltd", valueUsd: 41000, country: "India", domain: "travel booking software", own: ["CMT-005"] },
  { file: "2024-08-01_crestline_retail_msa.md", tracker: "C-002", title: "Crestline Retail — MSA", counterparty: "Crestline Retail Inc", valueUsd: 120000, country: "USA", domain: "retail data engineering / BI", own: ["CMT-002"] },
  { file: "2025-01-22_al_noor_mutual_nda.md", tracker: "C-013", title: "Al Noor Hospitality — Mutual NDA", counterparty: "Al Noor Hospitality Group", valueUsd: null, country: "UAE", domain: "hospitality guest analytics", own: ["CMT-001"] },
  { file: "2025-01-22_paytrack_technologies_msa.md", tracker: "C-005", title: "PayTrack Technologies — MSA", counterparty: "PayTrack Technologies", valueUsd: 71000, country: "India", domain: "payments fraud detection analytics" },
  { file: "2025-03-10_acme_retail_group_msa.md", tracker: "C-006", title: "Acme Retail Group — MSA", counterparty: "Acme Retail Group", valueUsd: 38000, country: "India", domain: "retail analytics" },
  { file: "2025-03-15_al_noor_hospitality_msa.md", tracker: "C-007", title: "Al Noor Hospitality — MSA", counterparty: "Al Noor Hospitality Group", valueUsd: 185000, country: "UAE", domain: "hospitality guest analytics", own: ["CMT-001"] },
  { file: "2025-04-18_sunrise_foods_msa.md", tracker: "C-008", title: "Sunrise Foods — MSA", counterparty: "Sunrise Foods", valueUsd: 33000, country: "India", domain: "food supply-chain analytics" },
  {
    file: "2025-04-28_rohan_iyer_contractor_agreement.md", tracker: "C-039", title: "Rohan Iyer — Contractor Agreement", counterparty: "Rohan Iyer", valueUsd: 18500, country: "India",
    domain: "freelancer for Acme dashboards", direction: "atliq_buyer",
    linked: [{ file: "2025-03-10_acme_retail_group_msa.md", title: "Acme Retail Group — MSA", docType: "msa", role: "client_contract" }],
  },
  { file: "2025-06-20_northwind_logistics_msa.md", tracker: "C-009", title: "Northwind Logistics — MSA (+ SOW-1)", counterparty: "Northwind Logistics", valueUsd: 54000, country: "UK", domain: "logistics pipeline engineering", own: ["CMT-004"] },
  { file: "2025-09-01_cloudspan_strategic_partnership_agreement.md", tracker: "C-032", title: "CloudSpan Technologies — Partnership Agreement", counterparty: "CloudSpan Technologies", valueUsd: null, country: "Singapore", domain: "data platform partnership", own: ["CMT-003"] },
  { file: "2025-10-06_atliq_intercompany_subcontractor_baa.md", tracker: "C-044", title: "AtliQ intercompany — Subcontractor BAA", counterparty: "AtliQ Technologies Pvt Ltd (intercompany)", valueUsd: null, country: "USA", domain: "healthcare analytics", direction: "atliq_buyer" },
  { file: "2025-10-06_carebridge_clinics_baa.md", tracker: "C-043", title: "CareBridge Clinics — BAA", counterparty: "CareBridge Clinics Inc", valueUsd: 76000, country: "USA", domain: "healthcare analytics" },
  { file: "2025-11-28_brightwater_insurance_msa.md", tracker: "C-014", title: "Brightwater Insurance — MSA", counterparty: "Brightwater Insurance Inc", valueUsd: 92000, country: "USA", domain: "insurance analytics" },
  { file: "2026-02-10_al_noor_waiver_letter.md", tracker: "C-016", title: "Al Noor — Waiver letter (Seaside)", counterparty: "Al Noor Hospitality Group", valueUsd: null, country: "UAE", domain: "hospitality", own: ["CMT-001"] },
  { file: "2026-07-16_meridian_healthcare_nda.md", tracker: "C-020", title: "Meridian Healthcare — NDA", counterparty: "Meridian Healthcare", valueUsd: null, country: "India", domain: "healthcare analytics" },
  { file: "2026-08-15_trustline_nbfc_msa.md", tracker: "C-021", title: "Trustline NBFC — MSA", counterparty: "Trustline NBFC", valueUsd: 48000, country: "India", domain: "lending (NBFC) analytics" },
  { file: "2026-08-20_harrington_health_mutual_nda.md", tracker: "C-045", title: "Harrington Health — Mutual NDA", counterparty: "Harrington Health Systems, Inc.", valueUsd: null, country: "USA", domain: "healthcare analytics" },
];

export type ExposureEntry = {
  file: string;
  tracker: string;
  title: string;
  counterparty: string;
  status: ReviewReport["status"];
  band: ReviewReport["band"];
  score: number | null;
  counts: ReviewReport["counts"];
  summary: ReviewReport["summary"];
  coverageLine: string;
  stop?: ReviewReport["stop"];
  error?: string;
  findings: Pick<ReviewReport["findings"][number], "id" | "check" | "category" | "severity" | "title" | "clause" | "foundIn" | "quote" | "quoteVerified" | "whatItMeans" | "whatItCouldCost" | "howToSoften" | "related">[];
};

async function reviewOne(s: Signed, ref: Reference): Promise<ExposureEntry> {
  const text = readFileSync(path.join(SIGNED_DIR, s.file), "utf8");
  const deal: DealContext = {
    counterparty: s.counterparty, valueUsd: s.valueUsd, currency: "USD", domain: s.domain, clientCountry: s.country,
    deliveredFrom: "Pune, India", dataTouchers: ["AtliQ Pune team"], direction: s.direction ?? "atliq_supplier", personalData: null, phi: null,
  };
  const ownRef: Reference = { ...ref, commitments: ref.commitments.filter((c) => !(s.own ?? []).includes(c.id)), waivers: ref.waivers.filter((w) => !(s.own ?? []).includes(w.commitmentId)) };
  const r = await runReview({
    text, deal, ref: ownRef, linkedToDeal: Boolean(s.linked?.length),
    linked: (s.linked ?? []).map((l) => ({ id: l.file, title: l.title, docType: l.docType, role: l.role, text: readFileSync(path.join(SIGNED_DIR, l.file), "utf8") })),
  });
  return {
    file: s.file, tracker: s.tracker, title: s.title, counterparty: s.counterparty, status: r.status, band: r.band, score: r.score, counts: r.counts,
    summary: r.summary, coverageLine: r.coverageLine, stop: r.stop, error: r.error,
    findings: r.findings
      .filter((f) => f.severity !== "minor")
      .map((f) => ({ id: f.id, check: f.check, category: f.category, severity: f.severity, title: f.title, clause: f.clause, foundIn: f.foundIn, quote: f.quote, quoteVerified: f.quoteVerified, whatItMeans: f.whatItMeans, whatItCouldCost: f.whatItCouldCost, howToSoften: f.howToSoften, related: f.related })),
  };
}

async function main() {
  const only = process.argv[2]?.toLowerCase();
  const list = SIGNED.filter((s) => !only || s.file.toLowerCase().includes(only));
  const ref = referenceFromSeed();
  const cfg = aiConfig();
  console.log(`Portfolio check: ${list.length} contract(s) on ${cfg.provider} ${cfg.model}`);
  const out: ExposureEntry[] = [];
  const queue = [...list];
  const concurrency = cfg.provider === "groq" ? 1 : 3;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const started = Date.now();
        const e = await reviewOne(s, ref);
        console.log(`  ${s.title}: ${e.status}${e.band ? ` · ${e.band} ${e.score}` : ""}${e.error ? ` · ${e.error}` : ""}${e.stop ? ` · ${e.stop.message}` : ""} (${Math.round((Date.now() - started) / 1000)}s)`);
        out.push(e);
      }
    }),
  );
  const file = path.join(ROOT, "data", "exposure.json");
  mkdirSync(path.dirname(file), { recursive: true });
  let previous: ExposureEntry[] = [];
  try {
    previous = JSON.parse(readFileSync(file, "utf8")).entries ?? [];
  } catch {
    // first run
  }
  const merged = [...previous.filter((p) => !out.some((o) => o.file === p.file)), ...out].sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), provider: cfg.provider, model: cfg.model, entries: merged }, null, 2));
  console.log(`Wrote ${path.relative(ROOT, file)} (${merged.length} contracts)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
