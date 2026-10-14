// Input gate (G1): decide whether a document can be reviewed at all, before any masking or AI call.
import { splitClauses, type ClauseMap } from "./clauses";
import { atliqIsParty, detectDocType, englishRatio, ENGLISH_THRESHOLD, findAtliqNames, OUT_OF_SCOPE_ALONE, type DocType } from "./doctype";
import { normaliseText, textHash } from "./hash";

export type GateStop =
  | "empty"
  | "duplicate"
  | "not_a_contract"
  | "not_english"
  | "atliq_not_party"
  | "out_of_scope";

export type GateResult =
  | { ok: true; text: string; hash: string; docType: DocType; title: string; clauses: ClauseMap; atliqNames: string[] }
  | {
      ok: false;
      stop: GateStop;
      message: string;
      hash: string;
      docType?: DocType;
      title?: string;
      duplicateOf?: string;
      clauseCount?: number;
    };

export const GATE_MESSAGES: Record<GateStop, string> = {
  empty: "This file has no readable text.",
  duplicate: "This exact document has already been uploaded. Open the existing review instead.",
  not_a_contract: "Not a contract: no numbered clauses were found. Upload the agreement itself, not a cover letter or email.",
  not_english: "English only: this document is not in English, so it cannot be reviewed reliably. Ask for the English version.",
  atliq_not_party: "AtliQ is not a party to this document, so there is nothing to review for AtliQ. Check you chose the right file; if AtliQ signs under another name, upload the version that names it.",
  out_of_scope:
    "Freelancer agreement: not reviewed as a deal. Link it to a client deal to check that the client's terms pass down to it.",
};

export type GateInput = {
  text: string;
  /** True when the upload is linked to a client deal (allows freelancer/subcontract pass-down checks). */
  linkedToDeal: boolean;
  /** Look up an existing contract by text hash; returns its id when found. */
  findByHash?: (hash: string) => Promise<string | null> | string | null;
};

export async function runGate(input: GateInput): Promise<GateResult> {
  const text = normaliseText(input.text);
  const hash = textHash(text);
  if (text.length < 40) return { ok: false, stop: "empty", message: GATE_MESSAGES.empty, hash };

  const duplicateOf = input.findByHash ? await input.findByHash(hash) : null;
  if (duplicateOf) return { ok: false, stop: "duplicate", message: GATE_MESSAGES.duplicate, hash, duplicateOf };

  const clauses = splitClauses(text);
  const { docType, title } = detectDocType(text);
  if (clauses.clauseCount === 0 && clauses.scheduleItemCount === 0 && clauses.sectionCount < 3) {
    return { ok: false, stop: "not_a_contract", message: GATE_MESSAGES.not_a_contract, hash, docType, title, clauseCount: 0 };
  }
  if (englishRatio(text) < ENGLISH_THRESHOLD) {
    return { ok: false, stop: "not_english", message: GATE_MESSAGES.not_english, hash, docType, title };
  }
  if (!atliqIsParty(text)) {
    return { ok: false, stop: "atliq_not_party", message: GATE_MESSAGES.atliq_not_party, hash, docType, title };
  }
  if (OUT_OF_SCOPE_ALONE.includes(docType) && !input.linkedToDeal) {
    const message =
      docType === "freelancer"
        ? GATE_MESSAGES.out_of_scope
        : `${docType === "employee" ? "Employee" : "Recruiter"} agreement: out of scope for contract review.`;
    return { ok: false, stop: "out_of_scope", message, hash, docType, title, clauseCount: clauses.clauseCount };
  }
  return { ok: true, text, hash, docType, title, clauses, atliqNames: findAtliqNames(text) };
}
