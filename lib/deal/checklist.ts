// The deal page's document checklist and data-transfer gate (features 17 and 19), decided by code from the deal's
// facts, its documents and AtliQ's live promises. Pure: the page passes everything in.
//   Base       a client deal needs its main agreement; an MSA needs a SOW (scope, milestones, fees); NDA-only deals need the NDA
//   R-HC-US    US client + patient data → NDA, MSA, BAA; no patient data moves until the BAA is signed
//   R-EU-PD    EU/EEA/UK client + personal data → MSA, DPA with a transfer mechanism to India; no data moves until it is signed
//   R-PASS     a contractor or agency in the deal → its agreement, with flow-down terms (gaps from its AI review)
//   Register   a live non-compete covering the client's country and field → the beneficiary's written waiver
import { splitClauses } from "@/lib/ingest/clauses";
import { isUS } from "@/lib/checks/entityLaw";

export type DealFacts = { clientCountry: string; domain: string; phi: boolean | null; personalData: boolean | null };
export type DealDoc = { id: string; role: string; docType: string; title: string; isSigned: boolean; band: string | null; reviewed: boolean; text?: string };
export type LivePromise = { id: string; type: string; contract: string; clauses: string[]; territory: string[]; domain: string; ends: string | null; waiverScopes: string[] };

export type CheckState = "signed" | "in_review" | "reviewed" | "draft" | "missing" | "check";
export type ChecklistItem = { key: string; label: string; why: string; state: CheckState; doc: DealDoc | null; note?: string; promise?: { id: string; contract: string; clause: string | null } };

/** The operative clause of a promise: section 1 is usually definitions, so prefer a clause outside it. */
export const mainClause = (clauses: string[]) => clauses.find((c) => !/^1(\.|$)/.test(c)) ?? clauses[0] ?? null;

const EU_UK = /\b(Austria|Belgium|Bulgaria|Croatia|Cyprus|Czech|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden|Iceland|Liechtenstein|Norway|UK|United Kingdom|England|Scotland|Wales)\b/i;
const CONTRACTOR_ROLES = ["freelancer", "subcontract"];
// Field words too broad to tie a promise to a deal on their own.
const GENERIC = new Set(["data", "analytics", "services", "service", "engineering", "software", "technology", "platform", "platforms", "partnerships", "solutions", "digital"]);

export const isHealthcareUS = (d: DealFacts) => isUS(d.clientCountry) && d.phi === true;
export const isPersonalEU = (d: DealFacts) => EU_UK.test(d.clientCountry) && (d.personalData === true || d.phi === true);

function stateOf(doc: DealDoc | null): CheckState {
  if (!doc) return "missing";
  if (doc.isSigned) return "signed";
  return doc.reviewed ? "reviewed" : doc.band === null ? "draft" : "in_review";
}

/** A live promise binds this deal when the client's country is in its territory and its field shares a specific word. */
export function promisesInPlay(deal: DealFacts, promises: LivePromise[]): LivePromise[] {
  const field = deal.domain.toLowerCase();
  const country = deal.clientCountry.toLowerCase();
  return promises.filter((p) => {
    if (p.type !== "non_compete" && p.type !== "partner_exclusivity") return false;
    const where = p.territory.some((t) => t.toLowerCase() === "worldwide" || t.toLowerCase() === country);
    const words = p.domain
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !GENERIC.has(w));
    return where && words.some((w) => field.includes(w));
  });
}

export function buildChecklist(deal: DealFacts, docs: DealDoc[], promises: LivePromise[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const find = (pred: (d: DealDoc) => boolean) => docs.find(pred) ?? null;
  const ofType = (...t: string[]) => find((d) => t.includes(d.docType) || t.includes(d.role));
  const main = find((d) => d.role === "client_contract" || d.role === "parent_msa") ?? ofType("msa", "partnership");
  const ndaOnly = !main && docs.length > 0 && docs.every((d) => d.docType === "nda" || d.role === "nda");
  const add = (key: string, label: string, why: string, doc: DealDoc | null, note?: string) => {
    if (!items.some((i) => i.key === key)) items.push({ key, label, why, state: stateOf(doc), doc, note });
  };

  if (ndaOnly) {
    add("nda", "NDA", "An NDA-only deal: the NDA is the document.", ofType("nda"));
  } else {
    add("main", "Main agreement (MSA or services agreement)", "Every client deal needs one.", main);
    if (main && main.docType === "msa") add("sow", "SOW: scope, milestones and fees", "An MSA sets the terms; the money and the work are in a SOW.", ofType("sow"));
  }
  if (isHealthcareUS(deal)) {
    const why = "US healthcare with patient data (R-HC-US): NDA, MSA and a HIPAA BAA.";
    add("nda", "NDA", why, ofType("nda"));
    add("baa", "HIPAA Business Associate Agreement (BAA)", why, ofType("baa"));
  }
  if (isPersonalEU(deal)) {
    const dpa = ofType("dpa");
    add("dpa", "Data Processing Agreement (GDPR Art. 28) with a transfer mechanism to India", "EU/UK client with personal data (R-EU-PD).", dpa, dpa ? "Check it includes SCCs or the UK IDTA for transfers to India." : undefined);
  }
  for (const c of docs.filter((d) => CONTRACTOR_ROLES.includes(d.role) || CONTRACTOR_ROLES.includes(d.docType))) {
    items.push({
      key: `pass-${c.id}`,
      label: `${c.title}: flow-down terms`,
      why: "A contractor or agency on a client deal (R-PASS) must promise at least what AtliQ promised the client.",
      state: c.isSigned ? "signed" : "check",
      doc: c,
      note: c.band ? "Reviewed against the client contract: see the Pass-down tab." : "Run its AI review to compare it with the client contract, term by term.",
    });
  }
  for (const p of promisesInPlay(deal, promises)) {
    const waiver = find((d) => d.docType === "waiver");
    const clause = mainClause(p.clauses);
    items.push({
      key: `waiver-${p.id}`,
      label: `Written waiver under ${p.contract}`,
      why: `${p.id}: ${p.contract}${clause ? ` Clause ${clause}` : ""} is live${p.ends ? ` until ${p.ends}` : ""} for ${deal.clientCountry} and this field.`,
      promise: { id: p.id, contract: p.contract, clause },
      state: waiver ? stateOf(waiver) : "missing",
      doc: waiver,
      note: p.waiverScopes.length ? `The waiver on file covers only: ${p.waiverScopes.join("; ")}.` : undefined,
    });
  }
  return items;
}

export const isComplete = (items: ChecklistItem[]) => items.every((i) => i.state === "signed" || i.state === "in_review" || i.state === "reviewed" || i.state === "draft");

export type Gate = { allowed: boolean | null; label: string; rule: string; quote: { doc: string; clause: string; text: string } | null; turnsGreen: string | null };

/** The clause in a deal document that ties data sharing to a BAA or DPA, quoted verbatim when there is one. */
function ruleQuote(docs: DealDoc[], kind: "BAA" | "DPA") {
  const want = kind === "BAA" ? /business associate agreement|\bBAA\b/i : /data processing (agreement|addendum)|\bDPA\b/i;
  const gate = /\b(until|unless|prior to|before|only after)\b/i;
  for (const d of docs.filter((x) => x.text && x.docType !== kind.toLowerCase())) {
    for (const s of splitClauses(d.text!).segments) {
      if (s.kind !== "clause" || !want.test(s.text) || !gate.test(s.text)) continue;
      return { doc: d.title, clause: s.id, text: s.text.replace(/^\s*\d+\.\d+\s+/, "").replace(/\*\*/g, "").trim() };
    }
  }
  return null;
}

export function dataGate(deal: DealFacts, docs: DealDoc[]): Gate {
  if (isHealthcareUS(deal)) {
    const signed = docs.some((d) => d.docType === "baa" && d.isSigned && d.role !== "freelancer");
    return signed
      ? { allowed: true, label: "Allowed", rule: "The BAA is signed.", quote: null, turnsGreen: null }
      : { allowed: false, label: "Not allowed: BAA unsigned", rule: "No patient data may be shared until a BAA is signed (R-HC-US).", quote: ruleQuote(docs, "BAA"), turnsGreen: "both sides sign the BAA" };
  }
  if (isPersonalEU(deal)) {
    const signed = docs.some((d) => d.docType === "dpa" && d.isSigned);
    return signed
      ? { allowed: true, label: "Allowed", rule: "The DPA is signed.", quote: null, turnsGreen: null }
      : { allowed: false, label: "Not allowed: no signed DPA", rule: "No personal data may move to India until a DPA with a transfer mechanism is signed (R-EU-PD).", quote: ruleQuote(docs, "DPA"), turnsGreen: "a DPA with SCCs (or the UK IDTA) is signed" };
  }
  return { allowed: null, label: "No rule found", rule: "No deal-type rule restricts when this client's data may be shared.", quote: null, turnsGreen: null };
}
