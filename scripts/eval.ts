// Evaluation harness (ROADMAP §11). Reads test_contracts/expected_results.json (read-only).
//   pnpm eval --gate-only   ingest + gate + masking checks for every case, edge fixture and format variant (no AI, no DB)
// Later phases add --quick, --all, --dataset and --repeat N, which run the full review pipeline.
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runReview } from "@/lib/pipeline/runReview";
import { referenceFromSeed } from "@/lib/reference/load";
import { dealFromCase, judgeCase, type CaseVerdict } from "@/lib/eval/judge";
import type { ReviewReport } from "@/lib/pipeline/types";
import type { PreviousFinding } from "@/lib/pipeline/versions";
import type { DealContext } from "@/lib/reference/types";
import { parseFile, IngestError } from "@/lib/ingest/parse";
import { runGate } from "@/lib/ingest/gate";
import { textHash } from "@/lib/ingest/hash";
import { Masker } from "@/lib/privacy/mask";
import { leakCheck } from "@/lib/privacy/leakcheck";
import type { ExpectedResults } from "@/lib/test-helpers";

const ROOT = process.cwd();
const TC = (rel: string) => path.join(ROOT, "test_contracts", rel);
const args = new Set(process.argv.slice(2));

type Row = { id: string; check: string; ok: boolean; detail: string };

const EDGE_EXPECT: Record<string, string> = {
  "edge/X1_german_language_contract.md": "not_english",
  "edge/X2_not_an_atliq_party.md": "atliq_not_party",
  "edge/X3_duplicate_of_TC01.md": "duplicate",
  "edge/X4_cover_letter_only.md": "not_a_contract",
};

async function gateOnly(): Promise<Row[]> {
  const expected: ExpectedResults = JSON.parse(readFileSync(TC("expected_results.json"), "utf8"));
  const rows: Row[] = [];
  const seen = new Map<string, string>(); // hash → case id, to detect duplicate uploads within the run

  for (const c of expected.cases) {
    const parsed = await parseFile(readFileSync(TC(c.file)), c.file);
    const gate = await runGate({
      text: parsed.text,
      linkedToDeal: Boolean(c.deal.linked?.length),
      findByHash: (h) => seen.get(h) ?? null,
    });
    seen.set(textHash(parsed.text), c.id);

    if (c.id === "TC50") {
      rows.push({ id: c.id, check: "scope gate", ok: !gate.ok && gate.stop === "out_of_scope", detail: gate.ok ? "passed (should stop)" : gate.message });
      continue;
    }
    if (!gate.ok) {
      rows.push({ id: c.id, check: "gate", ok: false, detail: `${gate.stop}: ${gate.message}` });
      continue;
    }
    rows.push({
      id: c.id,
      check: "clause count",
      ok: gate.clauses.clauseCount === c.clauses_numbered,
      detail: `${gate.clauses.clauseCount} of ${c.clauses_numbered} (+${gate.clauses.scheduleItemCount} schedule items) · ${gate.docType}`,
    });

    const masker = new Masker({ otherOrgs: ["Al Noor Hospitality Group", "Crestline Retail Inc", "Seaside Hotels LLC", "Northwind Logistics", "CloudSpan Technologies", "Orbit Travels"] });
    const masked = masker.mask(gate.text);
    const leak = leakCheck(masked, masker);
    const pii = c.pii_must_not_reach_ai ?? [];
    const piiLeft = pii.filter((p) => masked.includes(p));
    rows.push({
      id: c.id,
      check: "masking",
      ok: leak.ok && piiLeft.length === 0,
      detail: `${masker.keyEntries().length} labels${pii.length ? ` · ${pii.length - piiLeft.length}/${pii.length} required PII masked` : ""}${leak.ok ? "" : ` · LEAK ${leak.leaks.map((l) => l.detector).join(",")}`}`,
    });
    if (gate.clauses.unreadable.length) {
      rows.push({ id: c.id, check: "unreadable", ok: true, detail: `OCR damage in ${gate.clauses.unreadable.join(", ")} → Not sure` });
    }
  }

  for (const [file, stop] of Object.entries(EDGE_EXPECT)) {
    const parsed = await parseFile(readFileSync(TC(file)), file);
    const gate = await runGate({ text: parsed.text, linkedToDeal: false, findByHash: (h) => seen.get(h) ?? null });
    const id = path.basename(file).split("_")[0];
    rows.push({
      id,
      check: "edge gate",
      ok: !gate.ok && gate.stop === stop,
      detail: gate.ok ? "passed (should stop)" : `${gate.stop}${gate.duplicateOf ? ` of ${gate.duplicateOf}` : ""}: ${gate.message}`,
    });
  }

  for (const v of expected.format_variants) {
    const id = `${v.same_as}.${path.extname(v.file).slice(1)}`;
    try {
      const parsed = await parseFile(readFileSync(TC(v.file)), v.file);
      const gate = await runGate({ text: parsed.text, linkedToDeal: false });
      const want = expected.cases.find((c) => c.id === v.same_as)!.clauses_numbered;
      rows.push({
        id,
        check: "format",
        ok: gate.ok && gate.clauses.clauseCount === want,
        detail: gate.ok ? `${parsed.format}: ${gate.clauses.clauseCount} of ${want} clauses` : `${gate.stop}: ${gate.message}`,
      });
    } catch (err) {
      const scanned = err instanceof IngestError && err.code === "scanned_pdf";
      rows.push({
        id,
        check: "format",
        ok: scanned && v.same_as === "TC47",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return rows;
}

function report(rows: Row[]) {
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${w(r.id, 9)} ${w(r.check, 13)} ${r.detail}`);
  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} checks passed${failed.length ? ` · ${failed.length} failed` : ""}`);
  if (failed.length) process.exitCode = 1;
}

// ---------- Full pipeline runs ----------

const argv = process.argv.slice(2);
const argValue = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function printReport(label: string, r: ReviewReport) {
  console.log(`\n=== ${label} → ${r.status}${r.band ? ` · ${r.band} ${r.score}` : ""} · ${r.coverageLine} · ${r.provider ?? ""} ${r.model ?? ""} · ${r.tokensIn} in / ${r.tokensOut} out`);
  if (r.stop) console.log(`  stopped: ${r.stop.code} — ${r.stop.message}`);
  if (r.error) console.log(`  ERROR: ${r.error}`);
  for (const s of r.summary) console.log(`  » ${s.text} [${s.findingIds.join(",")}]`);
  for (const f of r.findings) {
    console.log(
      `  ${f.id.padEnd(4)} ${f.severity.padEnd(10)} ${f.check.padEnd(18)} ${String(f.clause ?? "—").padEnd(10)} ${f.quoteVerified ? "✓" : f.absent ? "∅" : "✗"} ${f.title}` +
        (f.whatItCouldCost && f.source === "code" ? `  — ${f.whatItCouldCost}` : ""),
    );
  }
}

function printVerdict(v: CaseVerdict) {
  const caught = v.catches.filter((c) => c.found).length;
  console.log(`  verdict: band ${v.band ?? "—"} (expected ${v.expectedBand}) ${v.bandOk ? "OK" : "MISMATCH"} · must-catch ${caught}/${v.catches.length} · serious precision ${v.seriousMatched}/${v.seriousTotal} · quotes ${v.quotesVerified}/${v.quotesTotal}`);
  for (const c of v.catches) {
    const mark = c.found ? "CAUGHT" : c.near ? `NEAR (${c.near.id} ${c.near.severity})` : "MISSED";
    console.log(`    ${mark.padEnd(22)} ${c.check}/${c.severity} @${c.clause}: "${c.quote.slice(0, 70)}"`);
  }
  for (const m of v.mustNotViolations) console.log(`    MUST-NOT  ${m}`);
}

async function runCases(ids: string[]): Promise<CaseVerdict[]> {
  const expected: ExpectedResults = JSON.parse(readFileSync(TC("expected_results.json"), "utf8"));
  const ref = referenceFromSeed();
  const verdicts: CaseVerdict[] = [];
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    const c = expected.cases.find((x) => x.id === id);
    if (!c) {
      console.error(`Unknown case ${id}`);
      continue;
    }
    const started = Date.now();
    // Bundle cases: link the other documents named in deal.linked (H1 = TC38+TC39, E1 = TC41+TC42, K1 = TC01+TC43).
    const ROLE: Record<string, string> = { baa: "baa", dpa: "dpa", subcontract: "subcontract", freelancer: "freelancer", nda: "nda", sow: "sow" };
    const linked = (c.deal.linked ?? []).map((lid) => {
      const lc = expected.cases.find((x) => x.id === lid)!;
      return { id: lid, title: `${lid} ${lc.kind.toUpperCase()}`, docType: lc.kind, role: ROLE[lc.kind] ?? "client_contract", text: readFileSync(TC(lc.file), "utf8") };
    });
    // TC49 is version 2 of TC23: review TC23 first (if not already in this run) and diff against it.
    const prevId = (c.deal as { previous_version?: string }).previous_version;
    let previous: { text: string; findings: PreviousFinding[] } | undefined;
    if (prevId) {
      const pc = expected.cases.find((x) => x.id === prevId)!;
      const prevReport = (results[prevId] as { report: ReviewReport } | undefined)?.report ?? (await runReview({ text: readFileSync(TC(pc.file), "utf8"), deal: dealFromCase(pc), ref }));
      previous = {
        text: readFileSync(TC(pc.file), "utf8").replace(/\r\n/g, "\n"),
        findings: prevReport.findings.map((f) => ({ key: f.id, check: f.check, category: f.category, clause: f.foundIn ?? f.clause, title: f.title, quote: f.quote })),
      };
    }
    const r = await runReview({
      text: readFileSync(TC(c.file), "utf8"),
      deal: dealFromCase(c),
      ref,
      linked,
      previous,
      linkedToDeal: Boolean(c.deal.linked?.length),
      onProgress: (step, detail) => process.stdout.write(`\r  ${id}: ${step} ${detail ?? ""}        `),
    });
    process.stdout.write("\n");
    printReport(`${id} (${Math.round((Date.now() - started) / 1000)}s)`, r);
    const v = judgeCase(c, r);
    printVerdict(v);
    verdicts.push(v);
    results[id] = { report: r, verdict: v };
  }
  mkdirSync(path.join(ROOT, "eval-results"), { recursive: true });
  const out = path.join(ROOT, "eval-results", `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify(results, null, 2));
  const caught = verdicts.flatMap((v) => v.catches).filter((c) => c.found).length;
  const total = verdicts.flatMap((v) => v.catches).length;
  const viol = verdicts.flatMap((v) => v.mustNotViolations).length;
  const sT = verdicts.reduce((a, v) => a + v.seriousTotal, 0);
  const sM = verdicts.reduce((a, v) => a + v.seriousMatched, 0);
  console.log(`\nTOTAL must-catch ${caught}/${total} · must-not violations ${viol} · bands ${verdicts.filter((v) => v.bandOk).length}/${verdicts.length} · serious precision ${sT ? Math.round((sM / sT) * 100) : 100}% · saved ${path.relative(ROOT, out)}`);
  return verdicts;
}

async function runFile(file: string) {
  const deal: DealContext = {
    counterparty: argValue("--counterparty") ?? null,
    valueUsd: argValue("--value") ? Number(argValue("--value")) : null,
    currency: argValue("--currency") ?? "USD",
    domain: argValue("--domain") ?? "analytics",
    clientCountry: argValue("--country") ?? "India",
    deliveredFrom: argValue("--from") ?? "Pune, India",
    dataTouchers: (argValue("--touchers") ?? "AtliQ Pune team").split(","),
    direction: argv.includes("--buyer") ? "atliq_buyer" : "atliq_supplier",
    personalData: null,
    phi: null,
  };
  const r = await runReview({
    text: readFileSync(path.resolve(ROOT, file), "utf8"),
    deal,
    ref: referenceFromSeed(),
    linkedToDeal: argv.includes("--linked"),
    onProgress: (step, detail) => process.stdout.write(`\r  ${step} ${detail ?? ""}        `),
  });
  process.stdout.write("\n");
  printReport(path.basename(file), r);
}

async function main() {
  if (args.has("--gate-only")) return report(await gateOnly());
  const cases = argValue("--cases");
  if (cases) return void (await runCases(cases.split(",").map((s) => s.trim().toUpperCase())));
  const file = argValue("--file");
  if (file) return runFile(file);
  console.error("Usage: pnpm eval --gate-only | --cases TC01,TC19 | --file <path> [--value N --country X --domain D --counterparty C --buyer]");
  process.exitCode = 2;
}

main();
