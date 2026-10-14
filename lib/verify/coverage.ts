// Coverage (G6): how many numbered clauses the AI confirmed reading, plus the register coverage line.
import type { ClauseMap } from "@/lib/ingest/clauses";

export function normaliseClauseId(id: string): string {
  const m = id.match(/(S?)(\d{1,3})\.(\d{1,2})/i);
  return m ? `${m[1].toUpperCase()}${+m[2]}.${+m[3]}` : id.trim();
}

export function coverage(map: ClauseMap, reviewed: string[]): { read: number; found: number; missing: string[]; line: string } {
  const seen = new Set(reviewed.map(normaliseClauseId));
  // SOWs number sections, not clauses: count "Section N" units instead.
  if (map.clauseIds.length === 0 && map.sectionCount > 0) {
    const sections = [...new Set(map.segments.filter((s) => /^Section \d+$/.test(s.id)).map((s) => s.id))];
    const reviewedNums = new Set(reviewed.map((r) => r.match(/(\d{1,3})/)?.[1]).filter(Boolean));
    const missing = sections.filter((s) => !reviewedNums.has(s.replace("Section ", "")));
    const read = sections.length - missing.length;
    return { read, found: sections.length, missing, line: `Read ${read} of ${sections.length} sections` };
  }
  const missing = map.clauseIds.filter((id) => !seen.has(id));
  const found = map.clauseIds.length;
  const read = found - missing.length;
  const unreadable = map.unreadable.filter((id) => /^\d+\.\d+$/.test(id)).length;
  const line = `Read ${read} of ${found} clauses${map.scheduleItemCount ? ` (+${map.scheduleItemCount} schedule items)` : ""}${unreadable ? ` · ${unreadable} partly unreadable` : ""}`;
  return { read, found, missing, line };
}

export const registerLine = (c: { onFile: number; signedInTracker: number }) =>
  `Checked against ${c.onFile} of ${c.signedInTracker} signed contracts`;
