// Splits a masked, clause-tagged contract into parts that fit one request. Never splits a clause.
// Parts after the first carry the parties block as context so the model knows who CLIENT_A and AtliQ are.
import { splitClauses, type Segment } from "@/lib/ingest/clauses";
import { estimateTokens } from "./client";

export type ContractPart = { label: string; text: string; segmentIds: string[]; clauseIds: string[] };

function render(s: Segment): string {
  return s.kind === "heading" || s.kind === "title" ? s.text : `[${s.id}] ${s.text}`;
}

export function chunkContract(maskedText: string, budgetTokens: number): ContractPart[] {
  const map = splitClauses(maskedText);
  const parties = map.segments.filter((s) => s.kind === "title" || s.kind === "parties");
  const context = parties.map(render).join("\n\n").slice(0, 2400);
  const contextTokens = estimateTokens(context);

  const parts: { segs: Segment[]; tokens: number }[] = [];
  let current: { segs: Segment[]; tokens: number } = { segs: [], tokens: 0 };
  for (const s of map.segments) {
    const t = estimateTokens(render(s)) + 2;
    const limit = parts.length === 0 ? budgetTokens : budgetTokens - contextTokens;
    if (current.segs.length > 0 && current.tokens + t > limit) {
      parts.push(current);
      current = { segs: [], tokens: 0 };
    }
    current.segs.push(s);
    current.tokens += t;
  }
  if (current.segs.length) parts.push(current);

  return parts.map((p, i) => {
    const body = p.segs.map(render).join("\n\n");
    const text =
      i === 0 ? body : `(Context only — the title and parties, already reviewed in part 1:)\n${context}\n\n(Part ${i + 1} begins:)\n${body}`;
    return {
      label: `${i + 1} of ${parts.length}`,
      text,
      segmentIds: p.segs.map((s) => s.id),
      clauseIds: p.segs.filter((s) => s.kind === "clause").map((s) => s.id),
    };
  });
}
