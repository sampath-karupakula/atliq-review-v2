// The report's shape, worked out from stored findings. Pure (no DB, no React), so the grouping, the exposure figures
// and the suggested next step are unit-tested and the screen only lays them out.
//
// Order on the page (the prototype's): summary → Not sure → clashes → Serious → Negotiable → Minor (folded) → rule
// checks → Can we deliver? → missing protections → usual terms. The rail shows the score, the exposure against the
// deal value and the decision lock.

export type Sev = "serious" | "negotiable" | "minor" | "not_sure" | "info";

export type ReportFinding = {
  id: string;
  /** Stable key within the review (F1, F2 …), used by the summary's links. */
  key: string;
  check: string;
  category: string | null;
  severity: Sev;
  title: string;
  clause: string | null;
  quote: string | null;
  quoteVerified: boolean;
  absent: boolean;
  whatItMeans: string | null;
  whatItCouldCost: string | null;
  howToSoften: string | null;
  versionTag: string | null;
  dismissed: boolean;
  dismissedBy: string | null;
  dismissReason: string | null;
  accepted: boolean;
  acceptNote: string | null;
  source: string;
  related: Record<string, unknown>;
  positions: { id: number; counterparty: string; date: string; term: string; outcome: string; label: string; quote: string }[];
};

const live = (f: ReportFinding) => !f.dismissed && f.versionTag !== "resolved";

export const RULE_CHECKS = new Set(["entity_law"]);
export const DELIVERY_CHECKS = new Set(["delivery", "bundle_missing", "bundle_conflict", "pass_down", "note_gap"]);

export type ReportGroups = {
  notSure: ReportFinding[];
  clashes: ReportFinding[];
  history: ReportFinding[];
  serious: ReportFinding[];
  negotiable: ReportFinding[];
  minor: ReportFinding[];
  rules: ReportFinding[];
  delivery: ReportFinding[];
  missing: ReportFinding[];
  resolved: ReportFinding[];
  dismissed: ReportFinding[];
};

/** Rule-check and delivery findings get their own panels; everything else goes to its severity group. */
export function groupFindings(all: ReportFinding[]): ReportGroups {
  const L = all.filter(live);
  const inGroups = (f: ReportFinding) => !RULE_CHECKS.has(f.check) && !DELIVERY_CHECKS.has(f.check) && f.check !== "history";
  return {
    notSure: L.filter((f) => f.severity === "not_sure"),
    clashes: L.filter((f) => f.check === "clash" && f.severity === "serious"),
    history: L.filter((f) => f.check === "history"),
    serious: L.filter((f) => f.severity === "serious" && inGroups(f)),
    negotiable: L.filter((f) => f.severity === "negotiable" && inGroups(f)),
    minor: L.filter((f) => f.severity === "minor" && inGroups(f)),
    rules: L.filter((f) => RULE_CHECKS.has(f.check) && f.severity !== "not_sure"),
    delivery: L.filter((f) => DELIVERY_CHECKS.has(f.check) && f.severity !== "not_sure"),
    missing: L.filter((f) => f.check === "missing_protection"),
    resolved: all.filter((f) => f.versionTag === "resolved"),
    dismissed: all.filter((f) => f.dismissed),
  };
}

// ---------- Score (recomputed from what is still open, so a dismissal shows at once) ----------

export const WEIGHT: Record<Sev, number> = { serious: 20, negotiable: 10, minor: 2, not_sure: 2, info: 0 };

export function liveCounts(all: ReportFinding[]): Record<Sev, number> {
  const c: Record<Sev, number> = { serious: 0, negotiable: 0, minor: 0, not_sure: 0, info: 0 };
  for (const f of all.filter(live)) c[f.severity]++;
  return c;
}

export function scoreBand(c: Record<Sev, number>): { score: number; band: "Low" | "Medium" | "High" } {
  const score = Math.min(100, c.serious * 20 + c.negotiable * 10 + c.minor * 2 + c.not_sure * 2);
  const band = c.serious > 0 || score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  return { score, band };
}

// ---------- Exposure in dollars against the deal value (feature 7) ----------

export type ExposureRow = { key: string; id: string; label: string; value: number | null; note: string | null; severity: Sev; accepted: boolean };

/**
 * One row per open Serious or Negotiable finding that code has priced. `null` means no ceiling (unbounded).
 * Figures come only from code arithmetic stored on the finding (perPeriod × periods, exposureUsd), never from the
 * AI's prose.
 */
export function exposureRows(all: ReportFinding[]): ExposureRow[] {
  const rows: ExposureRow[] = [];
  for (const f of all.filter(live)) {
    if (f.severity !== "serious" && f.severity !== "negotiable") continue;
    const r = f.related ?? {};
    const basis = r.basis;
    let value: number | null | undefined;
    let note: string | null = null;
    // An unbounded exposure has no ceiling, whatever else was priced: an uncapped penalty keeps growing past the fee.
    if (basis === "unbounded") value = null;
    else if (typeof r.exposureUsd === "number") value = r.exposureUsd;
    else if (typeof r.perPeriod === "number" && typeof r.periodsToFullFee === "number") value = r.perPeriod * r.periodsToFullFee;
    if (value === undefined) continue;
    if (typeof r.perPeriod === "number") {
      const per = `$${Math.round(r.perPeriod).toLocaleString("en-US")} a ${String(r.period ?? "day")}`;
      note = typeof r.periodsToFullFee === "number" ? `${per}; the full fee in ${r.periodsToFullFee} ${String(r.period ?? "day")}s` : per;
    }
    const where = f.clause ? ` · ${/^\d/.test(f.clause) ? `Clause ${f.clause}` : f.clause}` : "";
    rows.push({ key: f.key, id: f.id, label: `${f.title}${where}`, value, note, severity: f.severity, accepted: f.accepted });
  }
  // Unlimited first, then largest.
  return rows.sort((a, b) => (b.value === null ? Infinity : b.value) - (a.value === null ? Infinity : a.value));
}

export function exposureHeadline(rows: ExposureRow[], deal: number | null, fmt: (n: number) => string): string {
  if (!rows.length) return "Nothing in this contract could be priced in dollars.";
  if (rows.some((r) => r.value === null)) return deal ? `No ceiling on a ${fmt(deal)} deal` : "No ceiling on what AtliQ could owe";
  const top = rows[0]!.value!;
  if (!deal) return `Up to ${fmt(top)}`;
  return top > deal ? `Up to ${fmt(top)}: ${(top / deal).toFixed(1)}× the deal value` : `Up to ${fmt(top)}: ${Math.round((top / deal) * 100)}% of the deal value`;
}

// ---------- Suggested next step per finding (feature 34) ----------

export type NextStep = { kind: "escalate" | "negotiate" | "accept" | "check"; text: string };

export function nextStep(f: ReportFinding): NextStep {
  const basis = f.related?.basis;
  if (f.severity === "not_sure") return { kind: "check", text: "Check by hand" };
  if (f.check === "clash" && f.severity === "serious") return { kind: "escalate", text: "Escalate: breaks a live promise" };
  if (f.severity === "serious" && (basis === "irreversible" || !f.howToSoften)) return { kind: "escalate", text: "Escalate to Karandeep" };
  // Past positions only support accepting a minor point; a Serious or Negotiable item is negotiated on its merits.
  if (f.severity === "minor" && f.positions.some((p) => p.label === "standard")) return { kind: "accept", text: "Accept: AtliQ has agreed this before" };
  if (f.severity === "serious" || f.severity === "negotiable") return { kind: "negotiate", text: "Negotiate" };
  return { kind: "accept", text: "Accept" };
}

// ---------- Usual terms (feature 9) ----------

/** Which finding categories speak to each baseline term. */
const TERM_CATEGORIES: Record<string, string[]> = {
  liability_cap: ["liability"],
  delay_penalty: ["delay_penalty"],
  client_delay_exclusion: ["delay_penalty"],
  payment_days: ["payment"],
  indemnity: ["indemnity"],
  ip: ["ip"],
  termination_for_convenience: ["termination"],
  governing_law: ["law", "entity"],
  confidentiality: ["confidentiality"],
  nda: ["confidentiality"],
  insurance: ["insurance"],
};

export type UsualRow = { term: string; usual: string; count: string | null; differs: ReportFinding | null };

export function usualTerms(baseline: { term: string; usual: string; count: string | null }[], all: ReportFinding[], docType: string): UsualRow[] {
  const L = all.filter(live).filter((f) => f.severity !== "not_sure");
  return baseline
    .filter((b) => b.term !== "buyer_side_terms" && (b.term !== "nda" || docType === "nda"))
    .map((b) => {
      const cats = TERM_CATEGORIES[b.term] ?? [];
      const differs = L.find((f) => (f.check === "baseline" || f.check === "deal_value" || f.check === "entity_law" || f.check === "missing_protection" || f.check === "fairness") && cats.includes(f.category ?? "")) ?? null;
      return { term: b.term, usual: b.usual, count: b.count, differs };
    });
}

// ---------- NDA quick check (feature 11) ----------

type Extract = {
  terms?: { term: string; flags?: string[]; days?: number | null; clause?: string | null; quote?: string | null }[];
  restrictions?: { type: string; binds: string; duration: string | null; clause: string | null }[];
};

export type NdaTile = { label: string; value: string; ok: boolean; where: string };

export function ndaTiles(extract: Extract | null | undefined): NdaTile[] | null {
  if (!extract) return null;
  const conf = (extract.terms ?? []).filter((t) => t.term === "confidentiality");
  const oneWay = conf.find((t) => t.flags?.includes("one_way"));
  const mutual = conf.find((t) => t.flags?.includes("mutual"));
  const restr = extract.restrictions ?? [];
  const nonCompete = restr.find((r) => (r.type === "non_compete" || r.type === "exclusivity") && r.binds !== "counterparty");
  const noHire = restr.find((r) => r.type === "non_solicit" && r.binds !== "counterparty");
  const term = conf.find((t) => t.days != null);
  const perpetual = conf.find((t) => t.flags?.includes("perpetual"));
  const at = (c: string | null | undefined) => (c ? (/^\d/.test(c) ? `Clause ${c}` : c) : "Whole document");
  return [
    { label: "Mutual?", value: oneWay ? "No, one-way" : mutual ? "Yes" : "Not stated", ok: !oneWay, where: at((oneWay ?? mutual)?.clause) },
    { label: "Non-compete", value: nonCompete ? "Yes" : "None", ok: !nonCompete, where: at(nonCompete?.clause) },
    { label: "No-hire", value: noHire ? (noHire.duration ?? "Yes") : "None", ok: !noHire, where: at(noHire?.clause) },
    {
      label: "Duration",
      value: perpetual ? "Never ends" : term?.days ? (term.days >= 365 ? `${Math.round(term.days / 365)} years` : `${term.days} days`) : "Not stated",
      ok: !perpetual,
      where: at((perpetual ?? term)?.clause),
    },
  ];
}
