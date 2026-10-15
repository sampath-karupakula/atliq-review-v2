// The review pipeline (ROADMAP §7), as resumable steps over a serialisable state:
//   start (mask + leak check) → extract (AI-1, per part) → checks (code) → scan (AI-3, per part) → finalize
//   (verify quotes → merge → P7 severity → score → AI-5 summary). Clash (AI-2) and bundle (AI-4) join in P4.
// Every AI call goes through callStructured with the leak guard (G2). Pure: no DB access here.
import { aiConfig, appToday, type AiConfig } from "@/lib/config";
import { BundleSchema, ClashSchema, NotesSchema, type Bundle, type Clash, type NotesCheck } from "@/lib/ai/schemas";
import { BUNDLE_SYSTEM, bundleUser, CLASH_SYSTEM, clashUser, NOTES_SYSTEM, notesUser } from "@/lib/ai/prompts";
import { candidateCommitments, clashFindings, liveClients, rateCardClash } from "@/lib/checks/register";
import { checkBundle, type LinkedDoc } from "@/lib/checks/bundle";
import type { Segment } from "@/lib/ingest/clauses";

export type MaskedLinkedDoc = { id: string; title: string; docType: string; role: string; maskedText: string };
/** A call note on the deal: what someone wrote down was said or agreed. Outside the contract. */
export type CallNote = { id: string; label: string; text: string };
export type MaskedNote = { id: string; label: string; maskedText: string };
import { callStructured, estimateTokens, type AiCallRecord } from "@/lib/ai/client";
import { toStrictJsonSchema } from "@/lib/ai/jsonSchema";
import { chunkContract, type ContractPart } from "@/lib/ai/chunk";
import {
  EXTRACT_SYSTEM, extractUser, scanSystem, scanUser, SUMMARY_SYSTEM, summaryUser, baselineBlock, dealBlock,
} from "@/lib/ai/prompts";
import { ExtractSchema, ScanSchema, SummarySchema, type Extract, type Scan } from "@/lib/ai/schemas";
import { splitClauses } from "@/lib/ingest/clauses";
import { Masker } from "@/lib/privacy/mask";
import { assertNoLeak } from "@/lib/privacy/leakcheck";
import { referenceOrgNames } from "@/lib/reference/load";
import type { DealContext, Reference } from "@/lib/reference/types";
import { checkEntityLaw } from "@/lib/checks/entityLaw";
import { checkTerms } from "@/lib/checks/baseline";
import { checkInjection, checkReferences, checkUnreadable } from "@/lib/checks/document";
import { verifyQuote } from "@/lib/verify/quotes";
import { buyerSideSeverity, decideSeverity } from "@/lib/verify/severity";
import { mergeFindings } from "@/lib/verify/merge";
import { coverage, registerLine } from "@/lib/verify/coverage";
import { countSeverities, scoreOf } from "@/lib/score/score";
import type { FinalFinding, FindingDraft, ReviewReport, Severity } from "./types";

export type ReviewState = {
  v: 1;
  deal: DealContext;
  docType: string;
  title: string;
  atliqNames: string[];
  maskedText: string;
  maskKey: { token: string; original: string }[];
  extractParts: ContractPart[];
  scanParts: ContractPart[];
  extractResults: (Extract | null)[];
  scanResults: (Scan | null)[];
  extract: Extract | null;
  codeFindings: FindingDraft[] | null;
  /** Titles of documents linked in the deal bundle (so a linked BAA is not reported missing). */
  linkedTitles: string[];
  /** Linked documents in the deal bundle, masked with the same labels as the contract. */
  linked: MaskedLinkedDoc[];
  /** The dataset's "today" (APP_TODAY), fixed at the start so every step uses the same date. */
  today: string;
  /** AI-2 result, or "skipped" when no commitment needed a scope judgement. */
  clash: Clash | "skipped" | null;
  /** AI-4 result, or "skipped" when no linked subcontract/freelancer document needs a pass-down check. */
  bundle: Bundle | "skipped" | null;
  /** Call notes on the deal, masked with the same labels (absent in states saved before notes were compared). */
  notes?: MaskedNote[];
  /** AI-6 result, or "skipped" when the deal has no call notes. */
  noteCheck?: NotesCheck | "skipped" | null;
  tokensIn: number;
  tokensOut: number;
  model: string | null;
  provider: string | null;
};

export type StepOptions = {
  config?: AiConfig;
  onCall?: (r: AiCallRecord) => void | Promise<void>;
  /** Stop starting new AI calls after this many ms (keeps each serverless request under its time limit). */
  budgetMs?: number;
};

export type StepProgress = { done: boolean; completed: number; total: number };

// ---------- Masking ----------

function maskerFor(state: Pick<ReviewState, "deal">, ref: Reference): Masker {
  return new Masker({ counterparties: state.deal.counterparty ? [state.deal.counterparty] : [], otherOrgs: referenceOrgNames(ref) });
}

function restoreMasker(state: ReviewState, ref: Reference): Masker {
  return Masker.fromKey(state.maskKey, { counterparties: state.deal.counterparty ? [state.deal.counterparty] : [], otherOrgs: referenceOrgNames(ref) });
}

const OUTPUT_TOKENS = { anthropic: { extract: 32000, scan: 48000, summary: 8000 }, groq: { extract: 5000, scan: 5000, summary: 1500 } };

/** Reference text that may be sent in prompts (the same fields clashStep uses). */
function referenceMaskText(ref: Reference): string {
  return [
    ...ref.commitments.map((c) => `${c.contract}\n${c.activity}\n${c.forWhom}\n${c.territoryRule ?? ""}\n${c.quote}`),
    ...ref.clients.map((c) => `${c.name} (${c.country}): ${c.domain}`),
  ].join("\n");
}

/** Step 1 (code): mask the contract and run the leak check before any AI call. Throws MaskingLeakError on a leak. */
export function startReview(args: {
  text: string;
  deal: DealContext;
  docType: string;
  title: string;
  atliqNames: string[];
  ref: Reference;
  linkedTitles?: string[];
  /** Other documents in the deal bundle (original text); masked here with the same labels. */
  linked?: LinkedDoc[];
  /** Call notes on the deal (compared with the contract in the final step). */
  notes?: CallNote[];
  config?: AiConfig;
}): ReviewState {
  const cfg = args.config ?? aiConfig();
  const masker = maskerFor(args, args.ref);
  // Two passes: learn names from every document in the bundle first, then mask them all, so a name first seen
  // in a linked document is also masked in the main one (the leak check would otherwise block the call).
  // The register text (commitments, current clients) goes into the clash prompt too, so its names are learned up
  // front; otherwise a name first seen there would be unmasked in the contract text, and labels created later
  // would never reach the stored key.
  masker.mask(referenceMaskText(args.ref));
  masker.mask(args.text);
  for (const d of args.linked ?? []) masker.mask(d.text);
  for (const n of args.notes ?? []) masker.mask(`${n.label}\n${n.text}`);
  const maskedText = masker.mask(args.text);
  const linked = (args.linked ?? []).map((d) => ({ id: d.id, title: d.title, docType: d.docType, role: d.role, maskedText: masker.mask(d.text) }));
  const notes = (args.notes ?? []).map((n) => ({ id: n.id, label: masker.mask(n.label), maskedText: masker.mask(n.text) }));
  assertNoLeak(maskedText, masker);
  for (const d of linked) assertNoLeak(d.maskedText, masker);
  for (const n of notes) assertNoLeak(`${n.label}\n${n.maskedText}`, masker);

  // Each part must fit the provider's per-request budget alongside the rules and reference data.
  // Overhead per request: rules, reference data, deal block — and the response schema, which Groq counts.
  const schemaTokens = (s: object) => (cfg.provider === "groq" ? estimateTokens(JSON.stringify(toStrictJsonSchema(s as never, { compactNullable: true }))) : 0);
  const overheadExtract = estimateTokens(EXTRACT_SYSTEM + dealBlock(args.deal)) + schemaTokens(ExtractSchema) + 200;
  const overheadScan =
    estimateTokens(scanSystem(args.deal.direction) + baselineBlock(args.ref.baseline) + dealBlock(args.deal)) + schemaTokens(ScanSchema) + 200;
  // Groq counts ~15% more tokens than the shared estimate.
  const scale = cfg.provider === "groq" ? 0.86 : 1;
  const extractParts = chunkContract(maskedText, Math.max(1000, Math.floor((cfg.maxInputTokens - overheadExtract) * scale)));
  const scanParts = chunkContract(maskedText, Math.max(1000, Math.floor((cfg.maxInputTokens - overheadScan) * scale)));
  // Free-text deal details typed on the upload form (e.g. a freelancer's name under "who touches the data") go
  // into prompts too, so they are masked with the same labels. Code checks only use country/location fields.
  const maskedDeal: DealContext = {
    ...args.deal,
    dataTouchers: args.deal.dataTouchers.map((t) => masker.mask(t)),
    domain: masker.mask(args.deal.domain),
  };
  return {
    v: 1,
    deal: maskedDeal,
    docType: args.docType,
    title: args.title,
    atliqNames: args.atliqNames,
    maskedText,
    maskKey: masker.keyEntries(),
    extractParts,
    scanParts,
    extractResults: extractParts.map(() => null),
    scanResults: scanParts.map(() => null),
    extract: null,
    codeFindings: null,
    linkedTitles: [...(args.linkedTitles ?? []), ...linked.map((d) => d.title)],
    linked,
    today: appToday(),
    clash: null,
    bundle: null,
    notes,
    noteCheck: notes.length ? null : "skipped",
    tokensIn: 0,
    tokensOut: 0,
    model: null,
    provider: null,
  };
}

async function runParts<T>(
  state: ReviewState,
  ref: Reference,
  kind: "extract" | "scan",
  opts: StepOptions,
  call: (part: ContractPart, guard: (s: string) => void, cfg: AiConfig) => Promise<{ data: T; inputTokens: number; outputTokens: number; model: string; provider: string }>,
): Promise<StepProgress> {
  const cfg = opts.config ?? aiConfig();
  const masker = restoreMasker(state, ref);
  const guard = (s: string) => assertNoLeak(s, masker);
  const parts = kind === "extract" ? state.extractParts : state.scanParts;
  const results = (kind === "extract" ? state.extractResults : state.scanResults) as (T | null)[];
  const started = Date.now();
  for (let i = 0; i < parts.length; i++) {
    if (results[i]) continue;
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    const r = await call(parts[i], guard, cfg);
    results[i] = r.data;
    state.tokensIn += r.inputTokens;
    state.tokensOut += r.outputTokens;
    state.model = r.model;
    state.provider = r.provider;
  }
  const completed = results.filter(Boolean).length;
  return { done: completed === parts.length, completed, total: parts.length };
}

/** Step 2 (AI-1): extract facts from each part. Resumable. */
export function extractStep(state: ReviewState, ref: Reference, opts: StepOptions = {}): Promise<StepProgress> {
  return runParts<Extract>(state, ref, "extract", opts, (part, guard, cfg) =>
    callStructured({
      step: `extract ${part.label}`,
      system: EXTRACT_SYSTEM,
      user: extractUser(state.deal, part.text, part.label),
      schemaName: "contract_extract",
      schema: ExtractSchema,
      maxTokens: OUTPUT_TOKENS[cfg.provider].extract,
      guard,
      onCall: opts.onCall,
      // Extraction is mechanical: on Groq, spend the small per-minute budget on output, not reasoning.
      config: cfg.provider === "groq" ? { ...cfg, effort: "low" } : cfg,
    }),
  );
}

/** Merge per-part extracts: first non-empty value wins for single facts; lists are concatenated. */
export function mergeExtracts(parts: Extract[]): Extract {
  const first = <K extends keyof Extract>(k: K, has: (v: Extract[K]) => boolean): Extract[K] => (parts.find((p) => has(p[k])) ?? parts[0])[k];
  const quoted = (v: { quote: string | null }) => !!v.quote;
  return {

    atliq_entity_named: first("atliq_entity_named", (v) => !!v.value),
    invoicing_entity: first("invoicing_entity", (v) => !!v.value && quoted(v)),
    counterparty_country: parts.find((p) => p.counterparty_country)?.counterparty_country ?? null,
    governing_law: first("governing_law", (v) => !!v.law && quoted(v)),
    language_precedence: first("language_precedence", (v) => !!v.language && quoted(v)),
    deal_value: first("deal_value", (v) => v.amount != null),
    rate_card: parts.flatMap((p) => p.rate_card),
    locations: parts.flatMap((p) => p.locations),
    terms: parts.flatMap((p) => p.terms),
    restrictions: parts.flatMap((p) => p.restrictions),
    referenced_documents: parts.flatMap((p) => p.referenced_documents),
    data: {
      personal_data: parts.some((p) => p.data.personal_data),
      phi: parts.some((p) => p.data.phi),
      offshore_restriction: parts.find((p) => p.data.offshore_restriction)?.data.offshore_restriction ?? null,
      clause: parts.find((p) => p.data.quote)?.data.clause ?? null,
      quote: parts.find((p) => p.data.quote)?.data.quote ?? null,
    },
    not_bound_warranty: first("not_bound_warranty", (v) => v.present && quoted(v)),
    ai_directed_text: parts.flatMap((p) => p.ai_directed_text),
  };
}

/** Clause ids in every extracted item, normalised. */
function cleanExtract(e: Extract): Extract {
  const fix = <T extends { clause: string | null }>(x: T): T => ({ ...x, clause: cleanClause(x.clause) });
  return {
    ...e,
    atliq_entity_named: fix(e.atliq_entity_named),
    invoicing_entity: fix(e.invoicing_entity),
    governing_law: fix(e.governing_law),
    language_precedence: fix(e.language_precedence),
    deal_value: fix(e.deal_value),
    rate_card: e.rate_card.map(fix),
    locations: e.locations.map(fix),
    terms: e.terms.map(fix),
    restrictions: e.restrictions.map(fix),
    referenced_documents: e.referenced_documents.map(fix),
    data: fix(e.data),
    not_bound_warranty: fix(e.not_bound_warranty),
    ai_directed_text: e.ai_directed_text.map(fix),
  };
}

/** Step 3 (code): company/law, usual terms, deal value, missing protections, attachments, injection, OCR damage. */
export function checksStep(state: ReviewState): FindingDraft[] {
  const parts = state.extractResults.filter((x): x is Extract => !!x);
  if (parts.length !== state.extractParts.length) throw new Error("Extraction is not finished.");
  const extract = cleanExtract(mergeExtracts(parts));
  state.extract = extract;
  const maskedMap = splitClauses(state.maskedText);
  const findings = [
    ...checkEntityLaw({ atliqNames: state.atliqNames, extract, deal: state.deal }),
    ...checkTerms(extract, state.deal, state.docType, state.maskedText),
    ...checkReferences(extract, maskedMap, state.linkedTitles, state.linked.flatMap((d) => [d.docType, d.role])),
    ...checkInjection(state.maskedText, maskedMap, extract),
    ...checkUnreadable(maskedMap),
  ];
  state.codeFindings = findings;
  return findings;
}

/** Register and bundle findings that are pure code (rate-card vs best-price, BAA/DPA rules, offshore conflicts). */
function registerAndBundleCode(state: ReviewState, ref: Reference): FindingDraft[] {
  const extract = state.extract!;
  const candidates = candidateCommitments({ ref, extract, deal: state.deal, docType: state.docType, maskedText: state.maskedText, today: state.today });
  return [
    ...rateCardClash(extract, candidates, state.deal.currency),
    ...checkBundle({
      deal: state.deal, extract, docType: state.docType, maskedText: state.maskedText,
      linked: state.linked.map((d) => ({ id: d.id, title: d.title, docType: d.docType, role: d.role, text: d.maskedText })),
    }),
  ];
}

const CLASH_RELEVANT =
  /\b(hotels?|resorts?|propert(?:y|ies)|apartments?|guest|GCC|Saudi|UAE|Emirates|Dubai|Qatar|Doha|Kuwait|Bahrain|Oman|Muscat|territor|exclusiv|non-?compet|restrict|partner|platform|lakehouse|warehouse|reseller|referral|tools?|pre-existing|warrant|travel|booking|logistic|freight|lend|credit|nbfc|collections|fraud|services|scope|purpose)\b/i;

/** The parts of the contract that bear on scope: parties, services, locations, restrictions, warranties. */
function clashExcerpt(maskedText: string, budgetTokens: number): string {
  const segs = splitClauses(maskedText).segments;
  const pick = (s: Segment) => s.kind === "title" || s.kind === "parties" || (s.kind !== "heading" && CLASH_RELEVANT.test(s.text));
  const lines: string[] = [];
  let used = 0;
  for (const s of segs.filter(pick)) {
    const line = s.kind === "title" ? s.text : `[${s.id}] ${s.text}`;
    const t = estimateTokens(line);
    if (used + t > budgetTokens) break;
    lines.push(line);
    used += t;
  }
  return lines.join("\n\n");
}

/** Step 4 (AI-2): does this deal fall within each relevant earlier commitment? Skipped when nothing to judge. */
export async function clashStep(state: ReviewState, ref: Reference, opts: StepOptions = {}): Promise<void> {
  if (state.clash) return;
  const extract = state.extract;
  if (!extract) throw new Error("Checks must run before the clash check.");
  const cfg = opts.config ?? aiConfig();
  const candidates = candidateCommitments({ ref, extract, deal: state.deal, docType: state.docType, maskedText: state.maskedText, today: state.today })
    // Best-price with a rate card is pure arithmetic (code). Expired commitments in a merely related domain become
    // history without a judgement; expired ones in the same domain are judged so the history item can quote the
    // words in this contract that fall within the old restriction.
    .filter((c) => !(c.type === "best_price" && extract.rate_card.length) && !(c.status === "expired" && c.reason !== "same domain"));
  const newRestrictions = extract.restrictions.some((r) => (r.binds === "atliq" || r.binds === "both") && (r.type === "non_compete" || r.type === "exclusivity"));
  if (!candidates.length && !newRestrictions) {
    state.clash = "skipped";
    return;
  }
  const masker = restoreMasker(state, ref);
  const commitments = candidates
    .map((c) => `${c.id} | ${c.type} | ${c.contract} §${c.clauses.join(", §")} | binds affiliates: ${c.bindsAffiliates ? "yes" : "no"}\n  activity: ${c.activity}\n  for whom: ${c.forWhom}\n  territory: ${c.territory.join(", ")}${c.territoryRule ? ` — ${c.territoryRule}` : ""}\n  quote: "${c.quote}"`)
    .join("\n");
  const clients = newRestrictions ? liveClients(ref, state.today).map((c) => `${c.name} (${c.country}): ${c.domain}`).join("\n") : "(none needed)";
  const overhead = estimateTokens(CLASH_SYSTEM + commitments + clients + dealBlock(state.deal)) + 600;
  const scale = cfg.provider === "groq" ? 0.86 : 1;
  const excerpt = clashExcerpt(state.maskedText, Math.max(800, Math.floor((cfg.maxInputTokens - overhead) * scale)));
  const res = await callStructured({
    step: "clash",
    system: CLASH_SYSTEM,
    user: clashUser(state.deal, masker.mask(commitments), masker.mask(clients), excerpt),
    schemaName: "clash",
    schema: ClashSchema,
    maxTokens: cfg.provider === "groq" ? 3000 : 24000,
    guard: (s) => assertNoLeak(s, masker),
    onCall: opts.onCall,
    config: cfg,
  });
  state.clash = res.data;
  state.tokensIn += res.inputTokens;
  state.tokensOut += res.outputTokens;
}

const PASS_DOWN_RELEVANT = /\b(confidential|intellectual property|IP\b|work product|deliverables|owner|assign|licen[cs]e|personal data|data protection|PHI|health information|security|subcontract|sub-?processor|return|destroy|audit)\b/i;

function passDownExcerpt(maskedText: string, budgetTokens: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of splitClauses(maskedText).segments) {
    if (!(s.kind === "title" || s.kind === "parties" || (s.kind !== "heading" && PASS_DOWN_RELEVANT.test(s.text)))) continue;
    const line = s.kind === "title" ? s.text : `[${s.id}] ${s.text}`;
    const t = estimateTokens(line);
    if (used + t > budgetTokens) break;
    lines.push(line);
    used += t;
  }
  return lines.join("\n\n");
}

/** Step 6 (AI-4): pass-down gaps and conflicts with linked subcontract/freelancer documents. */
export async function bundleStep(state: ReviewState, ref: Reference, opts: StepOptions = {}): Promise<void> {
  if (state.bundle) return;
  // Pass-down gaps belong on the agency/freelancer document (the one that must carry the client's terms), so
  // AI-4 runs when reviewing that document against the linked client contract. The client contract's own
  // report shows its bundle rules (BAA/DPA, offshore conflicts) from code instead.
  const isSub = ["subcontract", "freelancer"].includes(state.docType) || state.deal.direction === "atliq_buyer";
  const partners = isSub ? state.linked.filter((d) => d.role === "client_contract" || d.docType === "msa") : [];
  if (!partners.length) {
    state.bundle = "skipped";
    return;
  }
  const cfg = opts.config ?? aiConfig();
  const masker = restoreMasker(state, ref);
  const overhead = estimateTokens(BUNDLE_SYSTEM + dealBlock(state.deal)) + 900;
  const scale = cfg.provider === "groq" ? 0.86 : 1;
  const half = Math.max(700, Math.floor(((cfg.maxInputTokens - overhead) * scale) / (partners.length + 1)));
  // Titles often contain the counterparty's name ("Acme Retail Group — MSA"), so they are masked too.
  const thisDoc = { title: `THIS DOCUMENT (${masker.mask(state.title)})`, text: passDownExcerpt(state.maskedText, half) };
  const others = partners.map((p) => ({ title: masker.mask(p.title), text: passDownExcerpt(p.maskedText, half) }));
  const res = await callStructured({
    step: "bundle",
    system: BUNDLE_SYSTEM,
    user: bundleUser(state.deal, isSub, thisDoc, others),
    schemaName: "bundle",
    schema: BundleSchema,
    maxTokens: cfg.provider === "groq" ? 3000 : 24000,
    guard: (s) => assertNoLeak(s, masker),
    onCall: opts.onCall,
    config: cfg,
  });
  state.bundle = res.data;
  state.tokensIn += res.inputTokens;
  state.tokensOut += res.outputTokens;
}

function bundleToDrafts(b: Bundle, state: ReviewState): FindingDraft[] {
  // Data pass-down gaps are Serious only when personal data or PHI is actually involved in the deal.
  const dataInvolved = !!(state.deal.personalData || state.deal.phi || state.extract?.data.personal_data || state.extract?.data.phi);
  const seen = new Set<string>();
  return b.gaps.filter((g) => {
    const k = `${g.type}|${(g.clause_a ?? "").replace(/[[\]]/g, "")}|${(g.clause_b ?? "").replace(/[[\]]/g, "")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((g) => {
    if (g.severity === "serious" && !dataInvolved && /\b(data|privacy|DPDP|GDPR|breach|security|personal)\b/i.test(`${g.title} ${g.why}`) && !/\b(IP|intellectual|ownership|owns?)\b/i.test(g.title)) {
      g = { ...g, severity: "negotiable" };
    }
    const thisIsA = /THIS DOCUMENT/i.test(g.doc_a) || !/THIS DOCUMENT/i.test(g.doc_b);
    const own = thisIsA ? { clause: g.clause_a, quote: g.quote_a } : { clause: g.clause_b, quote: g.quote_b };
    const other = thisIsA ? { doc: g.doc_b, clause: g.clause_b, quote: g.quote_b } : { doc: g.doc_a, clause: g.clause_a, quote: g.quote_a };
    const check: FindingDraft["check"] = g.type === "pass_down" ? "pass_down" : g.type === "conflict" ? "bundle_conflict" : g.type === "delivery" ? "delivery" : "bundle_missing";
    return {
      check, category: "data", severity: g.severity, basis: g.severity === "serious" ? "irreversible" : g.severity === "not_sure" ? "uncertain" : "bounded",
      title: g.title, clause: cleanClause(own.clause), quote: own.quote, absent: !own.quote,
      whatItMeans: g.why,
      whatItCouldCost: g.type === "pass_down" ? "AtliQ would owe the client obligations it cannot pass on to the party actually doing the work." : "The documents cannot both be complied with.",
      howToSoften: g.type === "pass_down" ? "Add matching confidentiality, IP and data-protection terms to the subcontract before work starts." : "Align the two documents before signing either.",
      source: "ai",
      related: { docB: other.doc.replace(/^THIS DOCUMENT\s*/i, ""), clauseB: cleanClause(other.clause), quoteB: other.quote, absentInB: g.absent_in_b, dataMustNotMoveUntil: g.data_must_not_move_until, flowDown: g.type === "pass_down" ? g.flow_down : null, linkedDocs: state.linked.map((d) => d.title) },
    } satisfies FindingDraft;
  });
}

/** Step 5 (AI-3): read every clause of each part against the baseline. Resumable. */
export function scanStep(state: ReviewState, ref: Reference, opts: StepOptions = {}): Promise<StepProgress> {
  return runParts<Scan>(state, ref, "scan", opts, (part, guard, cfg) =>
    callStructured({
      step: `scan ${part.label}`,
      system: scanSystem(state.deal.direction),
      user: scanUser(state.deal, ref.baseline, part.text, part.label),
      schemaName: "contract_scan",
      schema: ScanSchema,
      maxTokens: OUTPUT_TOKENS[cfg.provider].scan,
      guard,
      onCall: opts.onCall,
      config: cfg,
    }),
  );
}

const AI_CHECK: Record<string, FindingDraft["check"]> = {
  fairness: "fairness", missing_protection: "missing_protection", injection: "injection", entity: "entity_law", law: "entity_law",
};

/** "[10.2]", "Clause 10.2", "§10.2" → "10.2" */
export function cleanClause(c: string | null): string | null {
  if (!c) return c;
  return c.replace(/^\[|\]$/g, "").replace(/^(?:clause|section|§)\s*/i, "").trim() || null;
}

function scanToDrafts(scans: Scan[]): FindingDraft[] {
  // "Missing" is a whole-document judgement: a part cannot see protections that sit in another part.
  const multiPart = scans.length > 1;
  return scans.flatMap((s) =>
    s.findings.filter((f) => !(multiPart && f.absent)).map((f) => ({
      check: AI_CHECK[f.category] ?? "full_read",
      category: f.category,
      severity: f.proposed_severity as Severity,
      basis: f.basis,
      title: f.title,
      clause: cleanClause(f.clause),
      quote: f.absent ? null : f.quote,
      absent: f.absent,
      ...(f.absent ? { severity: (f.proposed_severity === "serious" ? "not_sure" : "minor") as Severity, basis: (f.proposed_severity === "serious" ? "uncertain" : "clarity") as FindingDraft["basis"] } : {}),
      whatItMeans: f.what_it_means,
      whatItCouldCost: f.what_it_could_cost,
      howToSoften: f.how_to_soften,
      source: "ai" as const,
    })),
  );
}

const POSITION_TOPICS: Record<string, RegExp> = {
  delay_penalty: /\bLD\b|penalt/i,
  liability: /liabilit/i,
  indemnity: /indemn/i,
  ip: /\bIP\b|intellectual/i,
  payment: /payment|\bpay\b|\d+-day/i,
  confidentiality: /NDA/i,
  law: /\blaw\b/i,
  restriction: /non-compete|exclusiv|best-price/i,
};

const ORDER: Record<Severity, number> = { serious: 0, negotiable: 1, minor: 2, not_sure: 3, info: 4 };

function clauseSortKey(c: string | null): number {
  const m = c?.match(/(\d{1,3})\.(\d{1,2})/);
  if (m) return +m[1] * 100 + +m[2];
  if (c && /^S(\d+)\.(\d+)/i.test(c)) return 90000;
  return c === "Parties" || c === "Title" ? 0 : 99999;
}

/** Step 7: verify quotes, merge, apply P7, score, summarise. Returns the report (display text unmasked). */
export async function finalizeStep(
  state: ReviewState,
  ref: Reference,
  originalText: string,
  opts: StepOptions = {},
): Promise<ReviewReport> {
  if (!state.codeFindings) checksStep(state);
  const scans = state.scanResults.filter((x): x is Scan => !!x);
  if (scans.length !== state.scanParts.length) throw new Error("The full read is not finished.");
  const masker = restoreMasker(state, ref);
  const originalMap = splitClauses(originalText);
  const maskedMap = splitClauses(state.maskedText);

  const evaluatedTopics = new Set<string>((state.extract?.terms ?? []).map((t) => (t.term === "liability_cap" ? "liability" : t.term === "termination_convenience" ? "termination" : t.term)));
  evaluatedTopics.add("entity").add("law");
  const merged = mergeFindings(state.codeFindings ?? [], scanToDrafts(scans), { evaluatedTopics });
  // Register and bundle findings are separate issues from clause-level findings on the same text (a new
  // non-compete is both a new restriction and a clash), so they are added after the merge, not merged into it.
  const extract = state.extract!;
  const candidates = candidateCommitments({ ref, extract, deal: state.deal, docType: state.docType, maskedText: state.maskedText, today: state.today });
  const clash = state.clash && state.clash !== "skipped" ? state.clash : { judgements: [], new_restrictions_hitting_clients: [] };
  // AI-6: call notes compared with the contract (only when the deal has notes).
  if (state.notes?.length && !state.noteCheck) {
    const cfg = opts.config ?? aiConfig();
    const overhead = estimateTokens(NOTES_SYSTEM + dealBlock(state.deal) + state.notes.map((n) => n.maskedText).join("\n")) + 800;
    const res = await callStructured({
      step: "notes",
      system: NOTES_SYSTEM,
      user: notesUser(state.deal, state.notes.map((n) => ({ id: n.id, label: n.label, text: n.maskedText })), passDownExcerpt(state.maskedText, Math.max(2000, cfg.maxInputTokens - overhead))),
      schemaName: "notes",
      schema: NotesSchema,
      maxTokens: cfg.provider === "groq" ? 2500 : 12000,
      guard: (s) => assertNoLeak(s, masker),
      onCall: opts.onCall,
      config: cfg,
    });
    const ids = new Set(state.notes.map((n) => n.id));
    state.noteCheck = { notes: res.data.notes.filter((n) => ids.has(n.note_id)) };
    state.tokensIn += res.inputTokens;
    state.tokensOut += res.outputTokens;
  }
  const noteCheck = state.noteCheck && state.noteCheck !== "skipped" ? state.noteCheck : null;
  const extra = [
    ...(noteCheck ? noteDrafts(noteCheck) : []),
    ...registerAndBundleCode(state, ref),
    ...clashFindings({
      candidates: candidates.filter((c) => !(c.type === "best_price" && extract.rate_card.length)),
      judgements: clash.judgements.map((j) => ({ ...j, contract_clause: cleanClause(j.contract_clause) })),
      // Only a new non-compete or exclusivity can put current work in breach (a best-price promise cannot), and the
      // counterparty itself is never a "current client put in breach" of its own contract.
      clientHits: clash.new_restrictions_hitting_clients
        .map((h) => ({ ...h, client: masker.unmask(h.client), restriction_clause: cleanClause(h.restriction_clause) }))
        .filter((h) => {
          const r = extract.restrictions.find((x) => cleanClause(x.clause) === h.restriction_clause);
          return !r || r.type === "non_compete" || r.type === "exclusivity";
        })
        .filter((h) => {
          const cp = (state.deal.counterparty ?? "").toLowerCase();
          const first = (s: string) => s.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
          return !cp || !(h.client.toLowerCase().includes(first(cp)) || cp.includes(first(h.client)));
        }),
      extract,
    }),
    ...(state.bundle && state.bundle !== "skipped" ? bundleToDrafts(state.bundle, state) : []),
  ];
  // A specific "Exhibit D — BAA / Annex 4 — data processing is referred to but missing" finding (with its quote)
  // makes the generic bundle rule ("no BAA/DPA in the deal") redundant: keep the specific one.
  const specificDataMissing = merged.some((f) => f.check === "bundle_missing" && f.category === "data" && f.quote);
  const extraDeduped = extra.filter((f) => !(specificDataMissing && (f.related?.rule === "R-HC-US" || f.related?.rule === "R-EU-PD")));
  // A bundle (AI-4) finding and a full-read finding on the same clause are one issue: keep the bundle one.
  const bundleClauses = new Set(extraDeduped.filter((f) => ["pass_down", "bundle_conflict", "bundle_missing", "delivery"].includes(f.check) && f.clause).map((f) => f.clause));
  const deduped = merged.filter((f) => !(f.source === "ai" && f.clause && bundleClauses.has(f.clause) && ["full_read", "fairness", "missing_protection"].includes(f.check)));
  const all = [...deduped, ...extraDeduped];
  const linkedOriginal = new Map(state.linked.map((d) => [d.title, masker.unmask(d.maskedText)]));

  const finals: FinalFinding[] = all.map((f) => {
    const quote = f.quote ? masker.unmask(f.quote) : null;
    const check = f.absent ? null : verifyQuote(originalText, quote, originalMap);
    const verified = !!check?.verified;
    const decision = decideSeverity(f, verified);
    const positions = ref.positions.filter((p) => POSITION_TOPICS[f.category]?.test(p.term)).map((p) => p.id);
    // A quote from the other document in the bundle is verified against that document.
    const related = f.related ? { ...f.related } : undefined;
    // The other document's title went to the AI masked (titles often name the client): restore it before using it
    // to find that document, or its quote can't be verified.
    if (related?.docB && typeof related.docB === "string") related.docB = masker.unmask(related.docB);
    if (related?.quoteB && typeof related.quoteB === "string") {
      related.quoteB = masker.unmask(related.quoteB);
      const docText = [...linkedOriginal.entries()].find(([t]) => String(related.docB ?? "").includes(t) || t.includes(String(related.docB ?? "")))?.[1];
      related.quoteBVerified = docText ? verifyQuote(docText, related.quoteB as string).verified : false;
    }
    if (related?.quote && typeof related.quote === "string") related.quote = masker.unmask(related.quote);
    if (related?.flowDown && typeof related.flowDown === "string") related.flowDown = masker.unmask(related.flowDown);
    return {
      ...f,
      related,
      id: "",
      title: masker.unmask(f.title),
      quote,
      whatItMeans: masker.unmask(f.whatItMeans),
      whatItCouldCost: masker.unmask(f.whatItCouldCost),
      howToSoften: masker.unmask(f.howToSoften),
      severity: buyerSideSeverity(f, decision.severity, state.deal.direction),
      quoteVerified: verified,
      foundIn: check?.verified ? check.clauseId : null,
      highlight: check?.verified ? { start: check.start, end: check.end } : null,
      notSureReason: decision.notSureReason,
      pastPositions: positions,
    };
  });
  finals.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || clauseSortKey(a.clause) - clauseSortKey(b.clause));
  finals.forEach((f, i) => (f.id = `F${i + 1}`));

  const counts = countSeverities(finals);
  const { score, band } = scoreOf(counts);
  const reviewed = scans.flatMap((s) => s.clauses_reviewed);
  const cov = coverage(maskedMap, reviewed);

  // AI-5 summary from verified findings only; ids checked by code. Falls back to a code summary.
  const top = finals.filter((f) => f.severity === "serious" || f.severity === "negotiable" || f.severity === "not_sure").slice(0, 12);
  let summary: { text: string; findingIds: string[] }[] = [];
  let summarySource: "ai" | "code" = "code";
  const cfg = opts.config ?? aiConfig();
  if (top.some((f) => f.severity !== "not_sure")) {
    try {
      const maskedTop = top.map((f) => ({ id: f.id, severity: f.severity, title: masker.mask(f.title), clause: f.clause, cost: masker.mask(f.whatItCouldCost) }));
      const res = await callStructured({
        step: "summary",
        system: SUMMARY_SYSTEM,
        user: summaryUser(maskedTop),
        schemaName: "summary",
        schema: SummarySchema,
        maxTokens: OUTPUT_TOKENS[cfg.provider].summary,
        guard: (s) => assertNoLeak(s, masker),
        onCall: opts.onCall,
        config: cfg,
      });
      state.tokensIn += res.inputTokens;
      state.tokensOut += res.outputTokens;
      const ids = new Set(finals.map((f) => f.id));
      const sentences = res.data.sentences.slice(0, 3).map((s) => ({ text: masker.unmask(s.text), findingIds: s.finding_ids.filter((id) => ids.has(id)) }));
      // Reject a summary that cites findings that do not exist.
      if (sentences.length && res.data.sentences.slice(0, 3).every((s) => s.finding_ids.every((id) => ids.has(id)))) {
        summary = sentences;
        summarySource = "ai";
      }
    } catch {
      // fall through to the code summary
    }
  }
  if (!summary.length) summary = codeSummary(finals);

  // One verdict per point in each note, with the contract quote checked word for word.
  const noteChecks = noteCheck?.notes.map((n) => {
    const quote = n.quote ? masker.unmask(n.quote) : null;
    const v = quote ? verifyQuote(originalText, quote, originalMap) : null;
    return { noteId: n.note_id, verdict: n.verdict, topic: masker.unmask(n.topic), clause: cleanClause(n.clause), quote, quoteVerified: !!v?.verified, explanation: masker.unmask(n.explanation) };
  });

  return {
    noteChecks,
    status: "done",
    score,
    band,
    counts,
    summary,
    summarySource,
    findings: finals,
    clausesRead: cov.read,
    clausesFound: cov.found,
    coverageLine: cov.line,
    registerLine: registerLine(ref.coverage),
    docType: state.docType,
    model: state.model,
    provider: state.provider,
    tokensIn: state.tokensIn,
    tokensOut: state.tokensOut,
  };
}

export function codeSummary(findings: FinalFinding[]): { text: string; findingIds: string[] }[] {
  const serious = findings.filter((f) => f.severity === "serious");
  const negotiable = findings.filter((f) => f.severity === "negotiable");
  const out: { text: string; findingIds: string[] }[] = [];
  for (const f of [...serious, ...negotiable].slice(0, 2)) out.push({ text: `${f.title} (clause ${f.clause ?? "—"}).`, findingIds: [f.id] });
  if (serious.length) out.push({ text: `Do not sign until the ${serious.length} serious item${serious.length > 1 ? "s are" : " is"} resolved.`, findingIds: serious.map((f) => f.id) });
  else if (negotiable.length) out.push({ text: `Negotiable points only — fine to proceed after raising them.`, findingIds: negotiable.map((f) => f.id) });
  else out.push({ text: "Matches AtliQ's usual terms; nothing serious found.", findingIds: [] });
  return out;
}

/** Note gaps (AI-6): a call promise the contract contradicts or leaves out. Always labelled as outside the contract. */
function noteDrafts(nc: NotesCheck): FindingDraft[] {
  return nc.notes
    .filter((n) => n.verdict === "clashes" || n.verdict === "check")
    .map((n) => {
      const clashes = n.verdict === "clashes";
      return {
        check: "note_gap",
        category: "notes",
        severity: "negotiable",
        basis: "bounded",
        title: clashes ? `Differs from the call note: ${n.topic}` : `Agreed on a call, not in the contract: ${n.topic}`,
        clause: cleanClause(n.clause),
        quote: n.quote,
        absent: !n.quote,
        whatItMeans: `Outside the contract: ${n.explanation}`,
        whatItCouldCost: "What was said on a call doesn't bind the client; only the signed contract does.",
        howToSoften: clashes
          ? "Ask for the contract to say what was agreed on the call, or confirm in writing which one stands."
          : "Write what was agreed on the call into the contract before signing.",
        source: "ai",
        related: { noteId: n.note_id, verdict: n.verdict, outsideContract: true },
      } satisfies FindingDraft;
    });
}
