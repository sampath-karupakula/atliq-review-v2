// Compares a review report with one answer-key case (ROADMAP §11.3–11.5).
import type { ExpectedCase } from "@/lib/test-helpers";
import type { FinalFinding, ReviewReport } from "@/lib/pipeline/types";
import type { DealContext } from "@/lib/reference/types";
import { clausesOverlap, familyMatches, quotesOverlap } from "./match";

export const CONTROLS = ["TC01", "TC02", "TC03", "TC04", "TC05", "TC07", "TC08", "TC14", "TC16", "TC18", "TC37"];

export function dealFromCase(c: ExpectedCase): DealContext {
  const d = c.deal as Record<string, unknown>;
  return {
    counterparty: null,
    valueUsd: (d.value_usd as number | null) ?? null,
    currency: "USD",
    domain: String(d.domain ?? ""),
    clientCountry: String(d.country ?? ""),
    deliveredFrom: String(d.delivered_from ?? "Pune, India"),
    dataTouchers: (d.data_touchers as string[]) ?? [],
    direction: /buyer/i.test(String(d.direction ?? "")) ? "atliq_buyer" : "atliq_supplier",
    personalData: null,
    phi: null,
  };
}

export type CatchResult = { check: string; severity: string; clause: string; quote: string; found: FinalFinding | null; near: FinalFinding | null };

function matches(m: NonNullable<ExpectedCase["must_catch"]>[number], f: FinalFinding, strictSeverity: boolean): boolean {
  if (m.severity === "not_sure") {
    if (f.severity !== "not_sure") return false;
  } else if (m.severity === "info") {
    if (f.severity !== "info" && !(m.check === "scope_gate" && f.check === "scope")) return false;
  } else if (m.severity === "resolved") {
    // A resolved finding no longer has a quote in the new version; match on the clause it used to sit in.
    // The fix may land in a neighbouring clause of the same section (exclusion added at 10.4 for a 10.2 finding).
    const section = (c: string | null | undefined) => c?.match(/(\d{1,3})\.\d/)?.[1];
    return (f as FinalFinding & { versionTag?: string }).versionTag === "resolved" && (clausesOverlap(m.clause, f.clause) || (!!section(m.clause) && section(m.clause) === section(f.clause)));
  } else {
    if (!familyMatches(m.check, f.check)) return false;
    if (strictSeverity && f.severity !== m.severity) return false;
  }
  return clausesOverlap(m.clause, f.clause) || clausesOverlap(m.clause, f.foundIn) || quotesOverlap(m.quote, f.quote);
}

export type CaseVerdict = {
  id: string;
  expectedBand: string;
  band: string | null;
  bandOk: boolean;
  catches: CatchResult[];
  mustNotViolations: string[];
  seriousTotal: number;
  seriousMatched: number;
  quotesTotal: number;
  quotesVerified: number;
};

export function judgeCase(c: ExpectedCase, r: ReviewReport): CaseVerdict {
  // A gate stop (e.g. TC50 scope) counts as an info finding on "Title".
  const findings: FinalFinding[] =
    r.status === "stopped" && r.stop?.code === "out_of_scope"
      ? [{ id: "G1", check: "scope", category: "scope", severity: "info", basis: "history", title: r.stop.message, clause: "Title", quote: null, absent: true, whatItMeans: "", whatItCouldCost: "", howToSoften: "", source: "code", quoteVerified: false, foundIn: "Title", highlight: null, notSureReason: null }]
      : r.findings;

  const catches = (c.must_catch ?? []).map((m) => ({
    check: m.check, severity: m.severity, clause: m.clause, quote: m.quote,
    found: findings.find((f) => matches(m, f, true)) ?? null,
    near: findings.find((f) => matches(m, f, false)) ?? null,
  }));

  const violations: string[] = [];
  const expectedBand = c.band;
  const bandOk = expectedBand === "n/a" ? r.status === "stopped" : r.band === expectedBand;
  if (CONTROLS.includes(c.id)) {
    const serious = findings.filter((f) => f.severity === "serious");
    if (serious.length) violations.push(`control has ${serious.length} serious finding(s): ${serious.map((f) => `${f.clause} ${f.title}`).join("; ")}`);
    if (r.band && r.band !== "Low") violations.push(`control scored ${r.band}`);
  }
  if ((c.must_not ?? []).some((m) => /score low/i.test(m)) && r.band === "Low") violations.push("scored Low");
  if (["TC07", "TC08", "TC14", "TC16"].includes(c.id) && findings.some((f) => f.check === "clash" && f.severity === "serious")) violations.push("clash reported on a no-clash control");
  if (c.id === "TC18" && findings.some((f) => f.check === "clash" && f.severity !== "info")) violations.push("expired Orbit restriction shown as a live clash");

  const expectedSerious = (c.must_catch ?? []).filter((m) => m.severity === "serious");
  const serious = findings.filter((f) => f.severity === "serious");
  const seriousMatched = serious.filter((f) => expectedSerious.some((m) => matches(m, f, false))).length;
  const withQuotes = findings.filter((f) => f.quote);
  return {
    id: c.id,
    expectedBand,
    band: r.band,
    bandOk,
    catches,
    mustNotViolations: violations,
    seriousTotal: serious.length,
    seriousMatched,
    quotesTotal: withQuotes.length,
    quotesVerified: withQuotes.filter((f) => f.quoteVerified).length,
  };
}
