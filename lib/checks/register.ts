// Clash check against the commitments register (O3). Code decides which commitments to look at, whether they
// are live, whether a waiver applies and what the result means; AI-2 only judges scope ("does this deal fall
// within the restriction?"). Dates always come from code (G5).
import type { FindingDraft } from "@/lib/pipeline/types";
import type { ClientRef, CommitmentRef, DealContext, Reference, WaiverRef } from "@/lib/reference/types";
import type { Extract } from "@/lib/ai/schemas";
import { commitmentStatus, formatDate, type CommitmentStatus } from "./dates";
import { money } from "./dealValue";

export type Candidate = CommitmentRef & { status: CommitmentStatus; reason: string; waivers: WaiverRef[] };

/** Topic words used to decide whether a deal and a commitment are in the same (or a neighbouring) domain. */
const TOPICS: Record<string, RegExp> = {
  hospitality: /\b(hotels?|hospitality|resorts?|serviced[- ]apartments?|aparthotels?|lodging|room nights?)\b/i,
  // Not "travel policy" or "travel expenses": only the travel-booking business.
  travel: /\b(online travel|travel[- ]booking|booking engine|OTA|travel agenc(?:y|ies)|tour operators?|flight bookings?)\b/i,
  data_platform: /\b(lakehouse|data ?warehouse platform|data platform|unified analytics platform|reseller|referral partner|implementation partner|partner program(?:me)?)\b/i,
  logistics: /\b(logistics|freight|warehous|shipping|supply chain|fleet|courier)\b/i,
  lending: /\b(lend|loan|credit|nbfc|non-banking|collections?|fraud)\b/i,
};
const NEIGHBOURS: Record<string, string[]> = { hospitality: ["travel"], travel: ["hospitality"] };

function topicsOf(text: string): Set<string> {
  return new Set(Object.entries(TOPICS).filter(([, re]) => re.test(text)).map(([k]) => k));
}

/** Commitments the clash check should look at, live and expired (expired ones become history). */
export function candidateCommitments(args: {
  ref: Reference;
  extract: Extract;
  deal: DealContext;
  docType: string;
  maskedText: string;
  today: string;
}): Candidate[] {
  const { ref, extract, deal, docType, maskedText, today } = args;
  const dealTopics = topicsOf(`${deal.domain} ${extract.locations.map((l) => l.place).join(" ")} ${maskedText.slice(0, 20000)}`);
  // The Northwind IP assignment only matters when this contract would hand over or warrant ownership of AtliQ's
  // tools (PipeKit named, pre-existing tools assigned, or a sole-ownership warranty) — not for a standard
  // "AtliQ keeps its tools and grants a licence" clause.
  const mentionsTools =
    /\bPipeKit\b/i.test(maskedText) ||
    extract.terms.some((t) => t.term === "ip" && t.flags.includes("pre_existing_assigned")) ||
    // A warranty TO the client that AtliQ solely owns / can freely give its tools (not "AtliQ remains the owner").
    /\b(?:warrants?|represents?)\b[^.\n]{0,100}\b(?:sole|exclusive|unencumbered|free and clear)\b[^.\n]{0,80}\b(?:own|title|rights?)\b/i.test(maskedText);
  // Partner exclusivity is about acting as a platform partner/reseller, not about building analytics.
  const partnerContext = docType === "partnership" || /\b(reseller|referral partner|implementation partner|partner program(?:me)?|referral fees?)\b/i.test(maskedText);
  const out: Candidate[] = [];
  for (const c of ref.commitments) {
    const status = commitmentStatus(c, today);
    const cTopics = topicsOf(`${c.domain} ${c.forWhom} ${c.activity}`);
    let reason = "";
    if (c.type === "partner_exclusivity" && !partnerContext) continue;
    if (c.type === "ip_assigned" && !mentionsTools) continue;
    if ([...cTopics].some((t) => dealTopics.has(t))) reason = "same domain";
    // A neighbouring domain is shown only as history (an expired restriction), never as a possible live clash.
    else if (status === "expired" && [...cTopics].some((t) => (NEIGHBOURS[t] ?? []).some((n) => dealTopics.has(n)))) reason = "related domain";
    if (c.type === "best_price" && extract.rate_card.length) reason = reason || "the contract has a rate card";
    if (c.type === "partner_exclusivity" && docType === "partnership") reason = reason || "partnership agreement";
    if (c.type === "ip_assigned" && mentionsTools) reason = reason || "the contract mentions AtliQ tools or an ownership warranty";
    if (reason) out.push({ ...c, status, reason, waivers: ref.waivers.filter((w) => w.commitmentId === c.id) });
  }
  return out;
}

/** Current clients a NEW restriction in this contract could put in breach. */
export function liveClients(ref: Reference, today: string): ClientRef[] {
  return ref.clients.filter((c) => c.status === "live" && (!c.ends || c.ends >= today));
}

/**
 * A waiver applies only when the deal is exactly within its scope. Every waiver on the register covers one
 * specific, already-signed SOW and excludes follow-on work, other properties and Affiliates — so a new contract
 * under review is never covered. Returned as a reason so the report can say why.
 */
export function waiverStatus(w: WaiverRef): { applies: false; reason: string } {
  return { applies: false, reason: `${w.id} (${formatDate(w.dated)}) covers only: ${w.scope}. It excludes: ${w.excludes}.` };
}

export type ClashJudgement = { commitment_id: string; applies: "yes" | "no" | "unsure"; reason: string; contract_clause: string | null; contract_quote: string | null; scope_match: string };
export type ClientHit = { client: string; restriction_clause: string | null; quote: string | null; reason: string };

const TYPE_LABEL: Record<string, string> = {
  non_compete: "non-compete",
  best_price: "best-price promise",
  partner_exclusivity: "partner exclusivity",
  ip_assigned: "IP assignment",
};

/** Turns AI-2's scope judgements into findings, applying dates, confirmation and waivers in code. */
export function clashFindings(args: { candidates: Candidate[]; judgements: ClashJudgement[]; clientHits: ClientHit[]; extract: Extract }): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const c of args.candidates) {
    const j = args.judgements.find((x) => x.commitment_id === c.id);
    const label = TYPE_LABEL[c.type] ?? c.type;
    const until = c.ends ? `until ${formatDate(c.ends)}` : "with no end date";
    const related = {
      commitmentId: c.id, contract: c.contract, clause: c.clauses.join(", "), quote: c.quote, ends: c.ends, status: c.status,
      waivers: c.waivers.map((w) => waiverStatus(w).reason),
    };

    if (c.status === "expired") {
      // History: shown with dates, never as a live clash.
      if (j?.applies === "no" && c.reason !== "same domain" && c.reason !== "related domain") continue;
      out.push({
        check: "history", category: "restriction", severity: "info", basis: "history",
        title: `History: ${c.contract} ${label} ended ${formatDate(c.ends)}`,
        clause: j && j.applies !== "no" ? j.contract_clause : null,
        quote: j && j.applies !== "no" ? j.contract_quote : null,
        absent: !(j && j.applies !== "no" && j.contract_quote),
        whatItMeans: `AtliQ once promised ${c.activity} would not be provided ${c.forWhom ? `to ${c.forWhom}` : ""} (${c.territory.join(", ")}). It ended on ${formatDate(c.ends)} and no longer binds AtliQ.`,
        whatItCouldCost: "Nothing now — shown so you know the history in this domain.",
        howToSoften: "No action needed.",
        source: "code",
        related,
      });
      continue;
    }
    if (!j || j.applies === "no") continue;

    if (!c.confirmed) {
      out.push({
        check: "clash", category: "restriction", severity: "not_sure", basis: "uncertain",
        title: `Possible clash with ${c.contract} ${label} — commitment not yet confirmed`,
        clause: j.contract_clause, quote: j.contract_quote, absent: false,
        whatItMeans: `This deal may fall within ${c.contract} §${c.clauses.join(", §")} (${until}), but that register entry has not been confirmed by Karandeep yet.`,
        whatItCouldCost: "Unknown until the commitment is confirmed.",
        howToSoften: "Confirm or correct the commitment in the register, then re-run the review.",
        source: "code",
        related: { ...related, notSureReason: "commitment not yet confirmed" },
      });
      continue;
    }

    if (j.applies === "unsure") {
      out.push({
        check: "clash", category: "restriction", severity: "not_sure", basis: "uncertain",
        title: `May clash with ${c.contract} ${label} (${until})`,
        clause: j.contract_clause, quote: j.contract_quote, absent: false,
        whatItMeans: `${j.reason} ${j.scope_match}`.trim(),
        whatItCouldCost: `If it does apply: breach of ${c.contract} §${c.clauses.join(", §")}.`,
        howToSoften: "Check the scope against the original clause, or ask counsel.",
        source: "ai",
        related: { ...related, notSureReason: "scope unclear" },
      });
      continue;
    }

    out.push({
      check: "clash", category: "restriction", severity: "serious", basis: "live_clash",
      title: `Clashes with ${c.contract} ${label} — live ${until}`,
      clause: j.contract_clause, quote: j.contract_quote, absent: false,
      whatItMeans: `${j.reason} ${j.scope_match}`.trim() + (c.waivers.length ? ` The waiver on record does not cover this deal: ${c.waivers.map((w) => waiverStatus(w).reason).join(" ")}` : ""),
      whatItCouldCost:
        c.type === "best_price"
          ? "Lower rates here must be passed back to the earlier client, retroactively."
          : `Signing would breach ${c.contract} §${c.clauses.join(", §")}${c.bindsAffiliates ? " (binds AtliQ's Affiliates too)" : ""}.`,
      howToSoften: c.type === "best_price" ? "Price at or above the committed rates, or get a written waiver first." : "Do not sign as drafted. Narrow the scope out of the restriction, or get a written waiver covering this exact deal.",
      source: "ai",
      related,
    });
  }

  for (const h of args.clientHits) {
    out.push({
      check: "clash", category: "restriction", severity: "serious", basis: "live_clash",
      title: `New restriction would breach current work for ${h.client}`,
      clause: h.restriction_clause, quote: h.quote, absent: false,
      whatItMeans: h.reason,
      whatItCouldCost: `AtliQ would be in breach on signing, because it already works for ${h.client}.`,
      howToSoften: "Delete the restriction, or carve out existing clients by name.",
      source: "ai",
      related: { client: h.client },
    });
  }

  // A "not bound by any restriction" promise is false on signing when a live clash exists (Gulf Crown §9.1(d)).
  const nb = args.extract.not_bound_warranty;
  if (nb.present && nb.quote && out.some((f) => f.check === "clash" && f.severity === "serious")) {
    out.push({
      check: "clash", category: "warranty", severity: "serious", basis: "irreversible",
      title: "AtliQ would promise it is not bound by any restriction — false on the day it signs",
      clause: nb.clause, quote: nb.quote, absent: false,
      whatItMeans: "The contract makes AtliQ confirm that no earlier agreement restricts this work. The clash above means that statement would be untrue.",
      whatItCouldCost: "A false warranty gives the client a claim from day one, separate from the clash itself.",
      howToSoften: "Delete the warranty or qualify it: \"except as disclosed in writing\", and disclose the restriction.",
      source: "code",
    });
  }
  return out;
}

const ROLE_ALIASES: [RegExp, string][] = [
  [/senior\s+data\s+engineer|sr\.?\s+data\s+engineer|senior\s+de\b/i, "Senior Data Engineer"],
  [/(?<!senior\s)data\s+engineer/i, "Data Engineer"],
  [/\bBI\b|business\s+intelligence/i, "BI Developer"],
];

/** Code-only best-price check: any rate below the committed reference rate breaches a live best-price promise. */
export function rateCardClash(extract: Extract, candidates: Candidate[], currency = "USD"): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const c of candidates.filter((x) => x.type === "best_price" && x.status !== "expired" && x.confirmed)) {
    const refRates = (c.extra.reference_rates_usd_per_hour ?? {}) as Record<string, number>;
    for (const row of extract.rate_card) {
      const role = ROLE_ALIASES.find(([re]) => re.test(row.role))?.[1];
      const committed = role ? refRates[role] : undefined;
      if (!role || committed == null || !row.quote || row.rate >= committed) continue;
      out.push({
        check: "clash", category: "restriction", severity: "serious", basis: "live_clash",
        title: `${row.role} at ${money(row.rate, currency)}/h is below the ${c.contract} best-price rate of ${money(committed, currency)}/h (live until ${formatDate(c.ends)})`,
        clause: row.clause, quote: row.quote, absent: false,
        whatItMeans: `${c.contract} §${c.clauses.join(", §")} promises that no other customer of AtliQ or its Affiliates gets a better rate for similar work.`,
        whatItCouldCost: `${c.extra.consequence ?? "The lower rate applies to that client retroactively."} Difference: ${money(committed - row.rate, currency)} per hour on every hour already billed to them at the higher rate.`,
        howToSoften: `Price ${role} at ${money(committed, currency)}/h or more, or get Crestline's written waiver first.`,
        source: "code",
        related: { commitmentId: c.id, contract: c.contract, clause: c.clauses.join(", "), quote: c.quote, ends: c.ends, status: c.status },
      });
    }
  }
  return out;
}
