// Usual-terms comparison (A2), missing protections (A3, Appendix B), deal-value arithmetic (O7) and the
// buyer-side mirror test — all rules in code, applied to the facts AI-1 extracted.
// Severity follows P7: Serious only for irreversible or unbounded harm; bounded departures are Negotiable.
import type { FindingDraft } from "@/lib/pipeline/types";
import type { DealContext } from "@/lib/reference/types";
import type { Extract, ExtractTerm, TermFlag } from "@/lib/ai/schemas";
import { capMultiple, fmtMultiple, money, penaltyMath } from "./dealValue";
import { splitClauses } from "@/lib/ingest/clauses";

const USUAL = {
  capMultiple: 1,
  paymentDays: 30,
  paymentMax: 45,
  noticeDays: 30,
  insurance: 1_000_000,
  penaltyWeeklyPct: 0.5,
  penaltyCapPct: 5,
};

type Rule = Omit<FindingDraft, "source"> & { source?: "code" };
const has = (t: ExtractTerm, flag: TermFlag) => t.flags.includes(flag);
const draft = (r: Rule): FindingDraft => ({ source: "code", ...r });

/** Terms of one type, merged: flags are true if any entry says so. */
function group(terms: ExtractTerm[], type: ExtractTerm["term"]) {
  const list = terms.filter((t) => t.term === type && t.quote);
  return { list };
}

/** Code backstop: wording that excuses the supplier for delays the client causes. */
export const CLIENT_DELAY_EXCLUSION =
  /\b(?:no|not)\b[^.\n]{0,80}\b(?:liquidated damages|penalt(?:y|ies)|service credits?)\b[^.\n]{0,160}\b(?:caused by|attributable to|resulting from|arising from)\b[^.\n]{0,40}\b(?:the )?(?:client|customer|company|purchaser)\b|\b(?:client|customer)[- ]caused delays?\b[^.\n]{0,80}\b(?:excluded|not payable|no liquidated)/i;

/** Code backstop: the penalty is stacked on top of other remedies ("in addition to … damages"). */
export const NOT_SOLE_REMEDY =
  /\bin addition to\b[^.\n]{0,80}\b(?:right to recover|actual damages|any other (?:right|remed)|other remedies|damages)\b|\bwithout prejudice to\b[^.\n]{0,60}\b(?:other (?:rights|remedies)|damages)\b/i;

/** The first clause that mentions a delay penalty and matches `re`, with the matching sentence as a verbatim quote. */
function findClause(text: string, re: RegExp, near: RegExp): { clause: string; quote: string } | null {
  for (const seg of splitClauses(text).segments) {
    if (seg.kind !== "clause" && seg.kind !== "schedule_item") continue;
    const m = seg.text.match(re);
    if (!m || !near.test(seg.text)) continue;
    return { clause: seg.id, quote: m[0].trim() };
  }
  return null;
}

export function checkTerms(extract: Extract, deal: DealContext, docType: string, originalText = ""): FindingDraft[] {
  const out: FindingDraft[] = [];
  const buyer = deal.direction === "atliq_buyer";
  const cur = deal.currency || "USD";
  const value = deal.valueUsd;
  const onAtliq = (t: ExtractTerm) => t.burdens === "atliq" || t.burdens === "both" || t.burdens === "unclear";
  const onVendor = (t: ExtractTerm) => t.burdens === "counterparty" || t.burdens === "both";
  const relevant = (t: ExtractTerm) => (buyer ? onVendor(t) : onAtliq(t));
  const terms = extract.terms.filter(relevant);

  // ---------- Delay penalty ----------
  const pen = group(terms, "delay_penalty");
  if (pen.list.length) {
    const main = pen.list.find((t) => t.rate_pct != null) ?? pen.list[0];
    const capEntry = pen.list.find((t) => t.cap_pct != null || t.cap_amount != null);
    const uncapped = !capEntry || pen.list.some((t) => has(t, "unlimited"));
    const excluded = pen.list.some((t) => has(t, "client_delay_excluded")) || CLIENT_DELAY_EXCLUSION.test(originalText);
    const notSoleTerm = pen.list.find((t) => has(t, "not_sole_remedy"));
    // Prefer the clause where the "in addition to … damages" wording actually sits (the AI often attaches the flag
    // to the main penalty clause); fall back to the AI's flag if the wording is phrased differently.
    const soleStated = pen.list.some((t) => has(t, "sole_remedy"));
    const notSoleText = soleStated ? null : findClause(originalText, NOT_SOLE_REMEDY, /liquidated damages|penalt|delay/i);
    const notSole = notSoleText ?? (notSoleTerm ? { clause: notSoleTerm.clause, quote: notSoleTerm.quote } : null);
    const math = penaltyMath({ ratePct: main.rate_pct, period: main.period, basis: main.basis, valueUsd: value, currency: cur, capped: !uncapped });
    // Keep titles short: the AI's "basis" is sometimes a whole sentence.
    const basisShort = (main.basis ?? "fee").split(/[,;.(]/)[0].trim().slice(0, 40) || "fee";
    const rateText = main.rate_pct != null ? `${main.rate_pct}% of the ${basisShort} per ${main.period ?? "period"}` : "a delay penalty";

    if (buyer) {
      if (uncapped || main.period === "day") {
        out.push(draft({
          check: "fairness", category: "delay_penalty", severity: "negotiable", basis: "bounded",
          title: `AtliQ's own paper: ${uncapped ? "uncapped" : "per-day"} penalty on the vendor (${rateText})`,
          clause: main.clause, quote: main.quote, absent: false,
          whatItMeans: "This is the kind of open-ended penalty AtliQ refuses when it is the supplier (\"never open-ended\").",
          whatItCouldCost: math.text ? `For the vendor: ${math.text}. A vendor that signs this may walk away or price it in.` : "Unlimited exposure for a small vendor.",
          howToSoften: "Offer AtliQ's own standard: 0.5% of the milestone fee per week, capped at 5%, no penalty for delays AtliQ causes.",
        }));
      }
    } else {
      if (uncapped) {
        out.push(draft({
          check: value && math.perPeriod ? "deal_value" : "baseline", category: "delay_penalty", severity: "serious", basis: "unbounded",
          title: `Uncapped delay penalty: ${rateText}`,
          clause: main.clause, quote: main.quote, absent: false,
          whatItMeans: "There is no ceiling on what AtliQ pays for being late. AtliQ's usual is 0.5% of the milestone fee per week, capped at 5%.",
          whatItCouldCost: math.text ? `${math.text}.` : "No upper limit.",
          howToSoften: "Cap the total at 5% of the affected milestone fee, charge per week not per day, and make it the client's sole remedy for delay.",
          related: { perPeriod: math.perPeriod, period: math.periodLabel, periodsToFullFee: math.periodsToFullFee },
        }));
      } else {
        const weekly = main.period === "week" ? main.rate_pct : main.period === "day" && main.rate_pct != null ? main.rate_pct * 7 : null;
        const capPct = capEntry?.cap_pct ?? null;
        if ((weekly != null && weekly > USUAL.penaltyWeeklyPct) || (capPct != null && capPct > USUAL.penaltyCapPct)) {
          out.push(draft({
            check: "baseline", category: "delay_penalty", severity: "negotiable", basis: "bounded",
            title: `Delay penalty above AtliQ's usual (${rateText}${capPct != null ? `, cap ${capPct}%` : ""})`,
            clause: main.clause, quote: main.quote, absent: false,
            whatItMeans: "The penalty is capped, but higher than AtliQ's usual 0.5% of the milestone fee per week, capped at 5%.",
            whatItCouldCost: capEntry?.cap_amount != null ? `Up to ${money(capEntry.cap_amount, cur)}.` : capPct != null ? `Up to ${capPct}% of the ${capEntry?.basis ?? "fee"}.` : "Bounded by the cap.",
            howToSoften: "Bring it to 0.5% of the milestone fee per week with a 5% cap.",
          }));
        }
      }
      if (!excluded) {
        out.push(draft({
          check: "missing_protection", category: "delay_penalty", severity: "serious", basis: "unbounded",
          title: "Penalty applies even when the client causes the delay",
          clause: main.clause, quote: main.quote, absent: false,
          whatItMeans: "Nothing excuses AtliQ when the client is late with access, data or approvals — AtliQ still pays the penalty.",
          whatItCouldCost: "At Brightwater the client gave access 19 days late and AtliQ still paid the penalty.",
          howToSoften: "Add: \"No liquidated damages are payable for any delay caused by the Client, its personnel or its other vendors.\"",
        }));
      }
      if (notSole) {
        out.push(draft({
          check: "baseline", category: "delay_penalty", severity: uncapped ? "serious" : "negotiable", basis: uncapped ? "unbounded" : "bounded",
          title: "Penalty is not the client's only remedy for delay",
          clause: notSole.clause, quote: notSole.quote, absent: false,
          whatItMeans: "The client can take the penalty and also sue for its actual losses. AtliQ's usual makes the penalty the sole remedy for delay.",
          whatItCouldCost: uncapped ? "Open-ended: the penalty plus any damages the client can prove." : "Damages on top of the capped penalty.",
          howToSoften: "Add: \"Liquidated damages are the Client's sole and exclusive remedy for delay.\"",
        }));
      }
    }
  }

  // ---------- Liability ----------
  const liab = group(terms, "liability_cap");
  if (liab.list.length) {
    // A carve-out ("the cap does not apply to fraud, wilful misconduct or the obligation to pay fees") is standard
    // and does not make liability unlimited; only a clause that removes the cap for claims generally does.
    const isCarveOut = (q: string | null) =>
      !!q &&
      /\b(fraud|wil+ful misconduct|gross negligence|death|personal injury|obligation to pay|payment of (?:the )?fees|breach of confidentiality)\b/i.test(q) &&
      !/\b(any claim|all claims|any and all|howsoever arising|unlimited|shall not be limited|not limited in any way)\b/i.test(q);
    const unlimited = liab.list.find((t) => has(t, "unlimited") && !isCarveOut(t.quote));
    if (unlimited) {
      out.push(draft({
        check: buyer ? "fairness" : "full_read", category: "liability", severity: buyer ? "negotiable" : "serious", basis: buyer ? "bounded" : "unbounded",
        title: buyer ? "AtliQ's own paper: the vendor's liability is unlimited" : "AtliQ's liability is unlimited",
        clause: unlimited.clause, quote: unlimited.quote, absent: false,
        whatItMeans: buyer
          ? "The vendor carries unlimited liability while AtliQ's is capped — a term AtliQ refuses as a supplier."
          : "This clause removes any ceiling on what AtliQ can be made to pay, overriding any cap elsewhere in the contract.",
        whatItCouldCost: buyer ? "A fair vendor will push back or price it in." : "One serious incident could cost more than the company is worth (AtliQ walked away from Kessler Mobility over this).",
        howToSoften: buyer ? "Cap both sides at the fees paid." : "Cap AtliQ's total liability at 1× the fees, with narrow carve-outs only.",
      }));
    } else if (!buyer) {
      const capped = liab.list.find((t) => t.cap_amount != null || t.cap_pct != null);
      if (capped) {
        const m = capMultiple({ capAmount: capped.cap_amount, capMultipleOfFees: null, capPct: capped.cap_pct, valueUsd: value });
        if (m != null && m > 3) {
          out.push(draft({
            check: "deal_value", category: "liability", severity: "serious", basis: "unbounded",
            title: `Liability cap is ${fmtMultiple(m)} the deal value`,
            clause: capped.clause, quote: capped.quote, absent: false,
            whatItMeans: "The cap exists but is out of proportion to what AtliQ earns from the deal. AtliQ's usual cap is 1× the fees.",
            whatItCouldCost: capped.cap_amount != null && value ? `Up to ${money(capped.cap_amount, cur)} on a ${money(value, cur)} deal.` : `Up to ${fmtMultiple(m)} the fees.`,
            howToSoften: "Cap AtliQ's liability at 1× the fees paid, mutual.",
          }));
        } else if (m != null && m > USUAL.capMultiple) {
          out.push(draft({
            check: "baseline", category: "liability", severity: "negotiable", basis: "bounded",
            title: `Liability cap ${fmtMultiple(m)} the fees (usual 1×)`,
            clause: capped.clause, quote: capped.quote, absent: false,
            whatItMeans: "Bounded, but above AtliQ's usual cap of 1× the fees (9 of 12 contracts).",
            whatItCouldCost: value ? `Up to ${money(m * value, cur)} instead of ${money(value, cur)}.` : `Up to ${fmtMultiple(m)} the fees.`,
            howToSoften: "Ask for 1× the fees; accept up to 1.5× only if the deal justifies it.",
          }));
        }
      }
    }
  }

  // ---------- Payment ----------
  for (const t of group(terms, "payment").list) {
    if (has(t, "pay_when_paid")) {
      out.push(draft({
        check: buyer ? "fairness" : "baseline", category: "payment", severity: "negotiable", basis: "bounded",
        title: buyer ? "AtliQ's own paper: pay-when-paid" : "Payment only when the end client pays",
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: buyer
          ? `The vendor is paid only after AtliQ is paid${t.days ? ` (up to ${t.days} days)` : ""}; AtliQ asks for 30 days itself.`
          : "AtliQ is paid only after someone else pays, so its cash depends on a third party.",
        whatItCouldCost: t.days ? `Cash tied up for up to ${t.days} days.` : "Open-ended wait for payment.",
        howToSoften: "Pay within 30 days of a valid invoice, regardless of upstream payment.",
      }));
    } else if (t.days != null && t.days > (buyer ? USUAL.paymentDays : USUAL.paymentMax)) {
      out.push(draft({
        check: buyer ? "fairness" : "baseline", category: "payment", severity: "negotiable", basis: "bounded",
        title: `Payment in ${t.days} days (usual 30, at most 45)`,
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: `Invoices are paid ${t.days} days after receipt; AtliQ's usual is 30 days, 45 at most.`,
        whatItCouldCost: value ? `About ${money((value * (t.days - USUAL.paymentDays)) / 365 * 0.12, cur)} of extra financing cost at 12% a year, plus cash-flow strain.` : "Slower cash flow.",
        howToSoften: "Ask for 30 days; accept 45 at most.",
      }));
    }
  }

  // ---------- Termination for convenience ----------
  for (const t of group(terms, "termination_convenience").list) {
    const shortNotice = t.days != null && t.days < USUAL.noticeDays;
    const wipUnpaid = has(t, "wip_unpaid");
    if (shortNotice || wipUnpaid) {
      out.push(draft({
        check: buyer ? "fairness" : "baseline", category: "termination", severity: "negotiable", basis: "bounded",
        title: [shortNotice ? `Exit on ${t.days} days' notice` : null, wipUnpaid ? "work in progress unpaid" : null].filter(Boolean).join("; "),
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: `${buyer ? "The vendor" : "AtliQ"} can be dropped${shortNotice ? ` on ${t.days} days' notice` : ""}${wipUnpaid ? " and is paid only for accepted deliverables, not work in progress" : ""}. AtliQ's usual is 30 days with work done and in progress paid.`,
        whatItCouldCost: wipUnpaid ? "Unbilled work in progress at the time of exit is lost." : "Little time to redeploy the team.",
        howToSoften: "30 days' notice; pay for all work done and work in progress up to the termination date.",
      }));
    }
  }

  // ---------- Indemnity ----------
  for (const t of group(terms, "indemnity").list.filter((t) => has(t, "covers_indemnitee_negligence"))) {
    if (buyer) continue;
    out.push(draft({
      check: "baseline", category: "indemnity", severity: "serious", basis: "unbounded",
      title: "AtliQ would cover the client's own negligence",
      clause: t.clause, quote: t.quote, absent: false,
      whatItMeans: "AtliQ must pay for losses even when the client caused them. AtliQ's usual is a mutual indemnity where each side covers its own fault.",
      whatItCouldCost: "Uninsurable and open-ended: AtliQ's insurance does not cover the client's mistakes.",
      howToSoften: "Make the indemnity mutual and exclude losses caused by the indemnified party's own negligence (the PayTrack fix).",
    }));
  }

  // ---------- IP ----------
  for (const t of group(terms, "ip").list.filter((t) => has(t, "pre_existing_assigned"))) {
    if (buyer) continue;
    out.push(draft({
      check: "baseline", category: "ip", severity: "serious", basis: "irreversible",
      title: "AtliQ's own tools would be assigned to the client",
      clause: t.clause, quote: t.quote, absent: false,
      whatItMeans: "Pre-existing tools and frameworks built into the deliverables would belong to the client. AtliQ could not reuse them for anyone else.",
      whatItCouldCost: "Permanent loss of reusable tools (the Northwind §9.2 PipeKit problem).",
      howToSoften: "Client owns deliverables made for it; AtliQ keeps its pre-existing tools and grants a non-exclusive licence.",
    }));
  }

  // ---------- Confidentiality / NDA ----------
  const nda = docType === "nda";
  for (const t of group(extract.terms, "confidentiality").list) {
    if (nda && has(t, "one_way") && onAtliq(t)) {
      out.push(draft({
        check: "fairness", category: "confidentiality", severity: "serious", basis: "irreversible",
        title: "\"Mutual\" NDA that only binds AtliQ",
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: "Only the other side's information is protected. Anything AtliQ shares — architecture, pricing, methods — is not.",
        whatItCouldCost: "AtliQ's know-how disclosed in discussions can be used or passed on freely; once out, it cannot be taken back.",
        howToSoften: "Make every obligation mutual: \"each Party\" as both discloser and recipient. AtliQ only signs mutual NDAs.",
      }));
    }
    if (has(t, "no_standard_exceptions")) {
      out.push(draft({
        check: "missing_protection", category: "confidentiality", severity: "negotiable", basis: "bounded",
        title: "No standard exceptions to confidentiality",
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: "Even public information, things AtliQ already knew or built independently, or disclosures required by law would count as a breach.",
        whatItCouldCost: "Disputes over information AtliQ is entitled to use.",
        howToSoften: "Add the usual exceptions: public, already known, independently developed, received from a third party, required by law.",
      }));
    }
    if (has(t, "perpetual")) {
      out.push(draft({
        check: "baseline", category: "confidentiality", severity: "negotiable", basis: "bounded",
        title: "Confidentiality never ends",
        clause: t.clause, quote: t.quote, absent: false,
        whatItMeans: "The obligation continues forever; AtliQ's usual is about 3 years after the agreement ends.",
        whatItCouldCost: "Indefinite record-keeping and breach risk.",
        howToSoften: "Limit to 3 years after termination (trade secrets can stay protected while they remain secret).",
      }));
    }
  }

  // ---------- Insurance ----------
  // One finding per clause: a clause listing several policies reports the largest amount demanded.
  const insuranceByClause = new Map<string, ExtractTerm>();
  for (const t of group(terms, "insurance").list.filter((t) => t.amount != null && t.amount > USUAL.insurance)) {
    const k = t.clause ?? t.quote ?? "";
    if (!insuranceByClause.has(k) || insuranceByClause.get(k)!.amount! < t.amount!) insuranceByClause.set(k, t);
  }
  for (const t of insuranceByClause.values()) {
    if (buyer) continue;
    const ratio = value ? t.amount! / value : null;
    out.push(draft({
      check: "deal_value", category: "insurance", severity: "negotiable", basis: "bounded",
      title: `Insurance demanded: ${money(t.amount!, cur)}${ratio ? ` (${fmtMultiple(ratio)} the deal)` : ""}`,
      clause: t.clause, quote: t.quote, absent: false,
      whatItMeans: `AtliQ's cyber and professional-indemnity cover is about $1M. This asks for ${money(t.amount!, cur)}.`,
      whatItCouldCost: "Buying extra cover could cost more than the margin on the deal, or AtliQ is in breach from day one.",
      howToSoften: "Offer AtliQ's existing $1M cover, or cap the requirement in proportion to the deal value.",
    }));
  }

  // ---------- Restrictions on AtliQ ----------
  for (const r of extract.restrictions.filter((r) => r.quote && (r.binds === "atliq" || r.binds === "both"))) {
    if (buyer) continue;
    // A mutual non-solicit is standard; a one-way one is a minor point.
    if (r.type === "non_solicit") {
      if (r.binds === "atliq") {
        out.push(draft({
          check: "baseline", category: "restriction", severity: "minor", basis: "clarity",
          title: "One-way non-solicit on AtliQ",
          clause: r.clause, quote: r.quote, absent: false,
          whatItMeans: "Only AtliQ is barred from hiring the other side's staff.",
          whatItCouldCost: "Little in practice; it is a fairness point.",
          howToSoften: "Make it mutual and limit it to staff directly involved, for 12 months.",
        }));
      }
      continue;
    }
    const label = { non_compete: "non-compete", exclusivity: "exclusivity", best_price: "best-price promise" }[r.type];
    out.push(draft({
      check: "full_read", category: "restriction", severity: "serious", basis: r.type === "best_price" ? "unbounded" : "irreversible",
      title: `New ${label} on AtliQ${r.territory ? ` (${r.territory})` : ""}${r.binds_affiliates ? ", binding Affiliates" : ""}`,
      clause: r.clause, quote: r.quote, absent: false,
      whatItMeans:
        r.type === "best_price"
          ? "AtliQ would promise this client its best rates, so any lower price offered elsewhere must be passed on to them."
          : `AtliQ${r.binds_affiliates ? " and its Affiliates" : ""} could not ${r.scope}${r.duration ? ` for ${r.duration}` : ""}.`,
      whatItCouldCost:
        r.type === "best_price"
          ? "Retroactive credits on every discount given to anyone else (the Crestline pattern)."
          : "Lost future work in this market for the whole period; may also breach promises to existing clients.",
      howToSoften: "Delete it, or narrow it to the named project, a short period and the client's direct competitors only.",
      related: { type: r.type, scope: r.scope, territory: r.territory, duration: r.duration },
    }));
  }
  return out;
}
