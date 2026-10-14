// Quote check (G4): every quote must be found word for word in the ORIGINAL text (after unmasking labels).
// Normalisation covers only presentation: whitespace, curly quotes, dashes, markdown bold, ellipses.
import { segmentAt, type ClauseMap } from "@/lib/ingest/clauses";

export function normaliseForMatch(s: string): string {
  return s
    .replace(/\*\*|__/g, "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\|/g, " ") // table pipes are presentation; PDF text has none
    .replace(/\s+/g, " ")
    .trim();
}

/** Builds the normalised text plus a map from normalised index → original index. */
function normaliseWithMap(text: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ch === "*" && text[i + 1] === "*") {
      i++;
      continue;
    }
    if (ch === "_" && text[i + 1] === "_") {
      i++;
      continue;
    }
    if (/[‘’‚′]/.test(ch)) ch = "'";
    else if (/[“”„″]/.test(ch)) ch = '"';
    else if (/[–—−]/.test(ch)) ch = "-";
    else if (ch === "|") ch = " ";
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else lastSpace = false;
    out.push(ch);
    map.push(i);
  }
  return { norm: out.join(""), map };
}

export type QuoteCheck =
  | { verified: true; start: number; end: number; clauseId: string | null }
  | { verified: false; reason: "empty" | "not_found" | "unreadable_source" };

/**
 * Verify a quote against the original text. A quote may contain "..." / "…" between verbatim pieces;
 * each piece must appear, in order. Pieces shorter than 12 characters are not accepted on their own.
 */
export function verifyQuote(original: string, quote: string | null | undefined, clauses?: ClauseMap): QuoteCheck {
  const q = normaliseForMatch(quote ?? "").replace(/^["']|["']$/g, "").trim();
  if (!q) return { verified: false, reason: "empty" };
  const { norm, map } = normaliseWithMap(original);
  const pieces = q
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length === 0 || (pieces.length > 1 && pieces.some((p) => p.length < 12))) {
    return { verified: false, reason: "not_found" };
  }
  let from = 0;
  let firstStart = -1;
  let lastEnd = -1;
  for (const p of pieces) {
    const at = norm.indexOf(p, from);
    if (at < 0) return { verified: false, reason: "not_found" };
    if (firstStart < 0) firstStart = at;
    lastEnd = at + p.length;
    from = lastEnd;
  }
  const start = map[firstStart];
  const end = map[lastEnd - 1] + 1;
  const clauseId = clauses ? (segmentAt(clauses, start)?.id ?? null) : null;
  return { verified: true, start, end, clauseId };
}

/** True when the cited clause and the clause the quote was actually found in agree (or no clause was cited). */
export function clauseAgrees(cited: string | null | undefined, foundIn: string | null): boolean {
  if (!cited || !foundIn) return true;
  const c = cited.replace(/^§\s*/, "").trim().toLowerCase();
  const f = foundIn.toLowerCase();
  return f === c || f.startsWith(`${c}`) || c.includes(f) || f.includes(c);
}
