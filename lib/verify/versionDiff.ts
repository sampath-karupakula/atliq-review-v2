// Version diff (ROADMAP §7.6.4): a returned draft is always reviewed in full, then its findings are compared
// with the previous version's. Match by check family + clause. Tags: new | unchanged | resolved.
// A dismissed finding stays dismissed only if its clause text is unchanged; if the text changed it reopens.
import { findingClauseKeys } from "@/lib/eval/match";

export type DiffInput = { key: string; check: string; category: string; clause: string | null; title: string; clauseText: string | null; dismissed?: boolean; dismissReason?: string | null; dismissedBy?: string | null };

export type DiffResult<T> = {
  current: (T & { versionTag: "new" | "unchanged"; carryDismissal: { by: string | null; reason: string | null } | null })[];
  resolved: DiffInput[];
};

const family = (f: { check: string; category: string }) => `${f.category}`;

function sameIssue(a: DiffInput, b: DiffInput): boolean {
  if (family(a) !== family(b)) return false;
  const ka = findingClauseKeys(a.clause);
  const kb = findingClauseKeys(b.clause);
  for (const k of ka) if (/^(s?\d+\.\d+|parties|title)$/.test(k) && kb.has(k)) return true;
  return !a.clause && !b.clause && a.title.toLowerCase() === b.title.toLowerCase();
}

const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** The text of the clause a finding points at, for "has this clause changed?" comparisons. */
export function clauseTextOf(text: string, clause: string | null, segments: { id: string; text: string }[]): string | null {
  void text;
  if (!clause) return null;
  const id = clause.match(/S?\d{1,3}\.\d{1,2}/i)?.[0] ?? clause;
  return segments.find((s) => s.id.toLowerCase() === id.toLowerCase())?.text ?? null;
}

export function diffVersions<T extends DiffInput>(previous: DiffInput[], current: T[]): DiffResult<T> {
  const matched = new Set<string>();
  const out = current.map((c) => {
    const prev = previous.find((p) => !matched.has(p.key) && sameIssue(p, c));
    if (!prev) return { ...c, versionTag: "new" as const, carryDismissal: null };
    matched.add(prev.key);
    const textUnchanged = norm(prev.clauseText) === norm(c.clauseText);
    return {
      ...c,
      versionTag: "unchanged" as const,
      carryDismissal: prev.dismissed && textUnchanged ? { by: prev.dismissedBy ?? null, reason: prev.dismissReason ?? null } : null,
    };
  });
  return { current: out, resolved: previous.filter((p) => !matched.has(p.key)) };
}
