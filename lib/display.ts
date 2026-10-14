// Presentation helpers shared by pages.

const DOC_LABEL: Record<string, string> = {
  msa: "Master services agreement",
  sow: "Statement of work",
  nda: "NDA",
  baa: "Business associate agreement",
  dpa: "Data processing agreement",
  partnership: "Partnership agreement",
  subcontract: "Subcontract",
  freelancer: "Freelancer agreement",
  waiver: "Waiver letter",
  other: "Document",
};

export const docLabel = (t: string) => DOC_LABEL[t] ?? t;

/** "Granite Peak Insurance · Master services agreement" — counterparty first, document kind second. */
export function displayTitle(c: { counterparty: string; docType: string; title: string }): { primary: string; secondary: string } {
  const counterparty = c.counterparty.replace(/\s+(Inc\.?|LLC|Ltd\.?|Limited|Pvt\.? Ltd\.?|Private Limited|GmbH|Co\.)$/i, "").trim();
  return { primary: counterparty, secondary: docLabel(c.docType) };
}

/** A contract heading in sentence case ("MASTER SERVICES AGREEMENT" → "Master services agreement"). */
export function sentenceCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export type DisplayLine = { kind: "heading" | "title" | "table" | "text"; start: number; end: number; text: string; map: number[] };

/**
 * Turns Markdown-ish contract text into display lines without ** and # markers, keeping a map from each display
 * character back to its offset in the original text, so quote highlights (original offsets) still land exactly.
 */
export function displayLines(text: string): DisplayLine[] {
  const out: DisplayLine[] = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    const lineStart = offset;
    offset += raw.length + 1;
    let kind: DisplayLine["kind"] = "text";
    let i = 0;
    const h = raw.match(/^(#{1,6})\s+/);
    if (h) {
      kind = h[1].length === 1 ? "title" : "heading";
      i = h[0].length;
    } else if (/^\s*\|/.test(raw)) {
      kind = "table";
      if (/^\s*\|?\s*:?-{3,}/.test(raw)) continue; // table separator row
    }
    let disp = "";
    const map: number[] = [];
    for (; i < raw.length; i++) {
      if (raw[i] === "*" && raw[i + 1] === "*") {
        i++;
        continue;
      }
      disp += raw[i];
      map.push(lineStart + i);
    }
    out.push({ kind, start: lineStart, end: lineStart + raw.length, text: disp, map });
  }
  return out;
}

const SPECIAL_SEGMENT: Record<string, string> = { signatures: "Signature block", recitals: "Recitals", parties: "Parties block", title: "Title", definitions: "Definitions" };

/**
 * A clause reference in plain words: "10.2" → "Clause 10.2", "Schedule 2, row 8" → "Schedule 2, table row 8",
 * "SIGNATURES, text" → "Signature block", "S1.4" → "Schedule item S1.4".
 */
export function clauseLabel(c: string | null | undefined): string {
  if (!c) return "";
  const s = c.trim();
  if (/^\d+(\.\d+)+$/.test(s)) return `Clause ${s}`;
  if (/^\d+(\.\d+)+(\s*,\s*\d+(\.\d+)+)+$/.test(s)) return `Clauses ${s.replace(/\s*,\s*/g, ", ")}`;
  if (/^S\d+(\.\d+)*$/i.test(s)) return `Schedule item ${s.toUpperCase()}`;
  if (/^section \d+/i.test(s)) return sentenceCase(s);
  const row = s.match(/^(.*?),\s*row\s+(\d+)$/i);
  if (row) return `${sentenceCase(row[1].trim())}, table row ${row[2]}`;
  const text = s.match(/^(.*?),\s*text$/i);
  const head = (text ? text[1] : s).trim();
  return SPECIAL_SEGMENT[head.toLowerCase()] ?? sentenceCase(head);
}
