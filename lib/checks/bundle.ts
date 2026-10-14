// Deal-bundle rules (A4 / O24 / O25, seed/deal_rules.json) that code can decide on its own:
//   R-HC-US  US client + PHI → a BAA must be in the bundle
//   R-EU-PD  EU/EEA/UK client + personal data → a DPA (and a transfer mechanism to India) must be in the bundle
//   Delivery a BAA that keeps PHI inside the US conflicts with delivery from Pune
// Pass-down gaps between documents need reading both texts and are judged by AI-4.
import type { FindingDraft } from "@/lib/pipeline/types";
import type { DealContext } from "@/lib/reference/types";
import type { Extract } from "@/lib/ai/schemas";
import { splitClauses } from "@/lib/ingest/clauses";
import { isUS } from "./entityLaw";

export type LinkedDoc = { id: string; title: string; docType: string; role: string; text: string };

const EU_UK = /\b(Austria|Belgium|Bulgaria|Croatia|Cyprus|Czech|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden|Iceland|Liechtenstein|Norway|UK|U\.K\.|United Kingdom|England|Scotland|Wales|EU|EEA)\b/i;

const OFFSHORE_BAN =
  /\b(?:shall not|must not|may not|will not)\b[^.\n]{0,120}\b(?:access|store|process|transmit|transfer|use|disclose|maintain)\b[^.\n]{0,120}\b(?:outside (?:of )?the (?:United States|U\.S\.|USA|continental United States)|offshore|outside the territorial)/i;
const ONSHORE_ONLY = /\b(?:solely|only|exclusively)\s+(?:within|in)\s+the\s+(?:United States|U\.S\.|continental United States)\b/i;
const SCC = /\b(standard contractual clauses|SCCs?|binding corporate rules|adequacy decision|international data transfer agreement|IDTA)\b/i;
/** This contract saying the work is done offshore (e.g. "may perform the Services from its delivery centre in Pune, India"). */
const OFFSHORE_DELIVERY = /\b(?:perform|deliver|provide|carry out)\w*\b[^.\n]{0,100}\b(?:from|in|at)\b[^.\n]{0,60}\b(?:Pune|India|offshore|delivery cent(?:re|er))\b/i;

function firstMatch(text: string, res: RegExp[]): { clause: string; quote: string } | null {
  for (const seg of splitClauses(text).segments) {
    for (const re of res) {
      const m = seg.text.match(re);
      if (m) {
        // Quote the whole sentence around the match, verbatim.
        const i = seg.text.indexOf(m[0]);
        const start = Math.max(0, seg.text.lastIndexOf(". ", i) + (seg.text.lastIndexOf(". ", i) >= 0 ? 2 : 0));
        const end = seg.text.indexOf(".", i + m[0].length);
        const quote = seg.text.slice(start, end > 0 ? end + 1 : undefined).replace(/^\[[^\]]+\]\s*/, "").replace(/^\s*\d+\.\d+\s+/, "").trim();
        return { clause: seg.id, quote: quote.length > 260 ? m[0] : quote };
      }
    }
  }
  return null;
}

export function checkBundle(args: { deal: DealContext; extract: Extract; docType: string; maskedText: string; linked: LinkedDoc[] }): FindingDraft[] {
  const { deal, extract, docType, maskedText, linked } = args;
  const out: FindingDraft[] = [];
  const hasType = (t: string) => docType === t || linked.some((d) => d.docType === t || d.role === t);
  const phi = deal.phi === true || extract.data.phi;
  const personal = deal.personalData === true || extract.data.personal_data || phi;
  const offshoreDelivery = !/\b(USA|United States|U\.S\.)\b/i.test(deal.deliveredFrom);

  if (docType !== "baa" && isUS(deal.clientCountry) && phi && !hasType("baa")) {
    out.push({
      check: "bundle_missing", category: "data", severity: "serious", basis: "irreversible",
      title: "Healthcare deal with no Business Associate Agreement (BAA)",
      clause: extract.data.clause, quote: extract.data.quote, absent: !extract.data.quote,
      whatItMeans: "A US client's protected health information is involved, but no HIPAA BAA is in the deal. AtliQ may not touch PHI without one.",
      whatItCouldCost: "HIPAA penalties and breach liability; the client cannot lawfully share the data.",
      howToSoften: "Get the BAA (and a subcontractor BAA for anyone touching PHI) agreed before any data moves.",
      source: "code",
      related: { rule: "R-HC-US", dataMustNotMoveUntil: "the BAA is signed" },
    });
  }

  if (EU_UK.test(deal.clientCountry) && personal && !hasType("dpa")) {
    const dpaInText = /data processing (agreement|addendum)|article 28/i.test(maskedText) && extract.referenced_documents.every((d) => d.governs !== "data" || d.present_in_text);
    if (!dpaInText) {
      out.push({
        check: "bundle_missing", category: "data", severity: "serious", basis: "irreversible",
        title: "Personal data from the EU/UK with no data-processing agreement in the deal",
        clause: extract.data.clause, quote: extract.data.quote, absent: !extract.data.quote,
        whatItMeans: "GDPR requires an Article 28 data-processing agreement, plus a lawful transfer mechanism (e.g. EU SCCs) because the work is done in India.",
        whatItCouldCost: "GDPR fines and contract breach; the client cannot lawfully send the data.",
        howToSoften: "Agree a DPA with SCCs for transfers to India before any personal data moves.",
        source: "code",
        related: { rule: "R-EU-PD", dataMustNotMoveUntil: "a DPA and transfer mechanism are agreed" },
      });
    } else if (!SCC.test(maskedText)) {
      out.push({
        check: "bundle_missing", category: "data", severity: "negotiable", basis: "bounded",
        title: "No transfer mechanism for personal data going to India",
        clause: extract.data.clause, quote: extract.data.quote, absent: !extract.data.quote,
        whatItMeans: "Data-protection terms exist, but nothing covers transferring EU/UK personal data to India.",
        whatItCouldCost: "The transfer itself could be unlawful.",
        howToSoften: "Add EU Standard Contractual Clauses (or the UK IDTA) for transfers to India.",
        source: "code",
        related: { rule: "R-EU-PD" },
      });
    }
  }

  // A BAA (this document or a linked one) that keeps PHI in the US vs delivery from Pune.
  if (offshoreDelivery) {
    const baas = [...(docType === "baa" ? [{ title: "this BAA", text: maskedText, self: true }] : []), ...linked.filter((d) => d.docType === "baa").map((d) => ({ title: d.title, text: d.text, self: false }))];
    for (const b of baas) {
      const hit = firstMatch(b.text, [OFFSHORE_BAN, ONSHORE_ONLY]);
      if (!hit) continue;
      // Reviewing the client contract: quote this contract's own offshore-delivery clause, with the BAA's ban as the other side.
      const own = b.self ? hit : firstMatch(maskedText, [OFFSHORE_DELIVERY]);
      out.push({
        check: "bundle_conflict", category: "data", severity: "serious", basis: "irreversible",
        title: `${b.self ? "This BAA" : b.title} keeps PHI in the US, but the work is delivered from ${deal.deliveredFrom}`,
        clause: own?.clause ?? null, quote: own?.quote ?? null, absent: !own,
        whatItMeans: `The BAA forbids accessing or storing PHI outside the United States. AtliQ's team works from ${deal.deliveredFrom}${deal.dataTouchers.length ? ` (${deal.dataTouchers.join(", ")})` : ""}, and "subcontractor" includes AtliQ's own Affiliates.`,
        whatItCouldCost: "Every access from India would be a HIPAA breach and a breach of the BAA.",
        howToSoften: "Agree an offshore-access exception with safeguards (de-identified data, US-hosted environment, subcontractor BAA with AtliQ Technologies Pvt Ltd), or staff the PHI work in the US.",
        source: "code",
        related: { docB: b.title, clauseB: b.self ? null : hit.clause, quoteB: b.self ? null : hit.quote, dataMustNotMoveUntil: "an offshore-access arrangement is agreed in the BAA" },
      });
      break;
    }
  }
  return out;
}
