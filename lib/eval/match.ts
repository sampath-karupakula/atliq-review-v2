// Answer-key helpers for scripts/eval.ts. The `clause` and `check` fields in expected_results.json are free text.

/**
 * "10.2–10.4" → {10.2, 10.3, 10.4}; "Parties; 14.1" → {parties, 14.1}; "2.2 vs BAA 4.1–4.2" → {2.2, 4.1, 4.2};
 * "Schedule 2, row 8" → {schedule 2, row 8}; "Sections 1.1, 1.2 and 2.1" → {1.1, 1.2, 2.1}; "S1.4" → {s1.4}.
 */
export function parseClauseRef(ref: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!ref) return out;
  const s = ref.replace(/[–—]/g, "-");
  for (const m of s.matchAll(/\b(S?)(\d{1,3})\.(\d{1,2})\s*-\s*(?:S?)(\d{1,3})\.(\d{1,2})\b/gi)) {
    const [, prefix, a1, b1, a2, b2] = m;
    if (a1 === a2) for (let b = +b1; b <= +b2; b++) out.add(`${prefix.toLowerCase()}${+a1}.${b}`);
    else {
      out.add(`${prefix.toLowerCase()}${+a1}.${+b1}`);
      out.add(`${prefix.toLowerCase()}${+a2}.${+b2}`);
    }
  }
  for (const m of s.matchAll(/\b(S?)(\d{1,3})\.(\d{1,2})\b/gi)) out.add(`${m[1].toLowerCase()}${+m[2]}.${+m[3]}`);
  for (const m of s.matchAll(/\bSchedule\s+(\d+)(?:,\s*row\s+(\d+))?/gi)) {
    out.add(`schedule ${m[1]}`);
    if (m[2]) out.add(`schedule ${m[1]}, row ${m[2]}`);
  }
  if (/\bParties\b/i.test(s)) out.add("parties");
  if (/\bTitle\b/i.test(s)) out.add("title");
  if (/Engagement Schedule/i.test(s)) out.add("engagement schedule");
  for (const m of s.matchAll(/\bSection\s+(\d{1,3})\b(?!\.)/gi)) out.add(`section ${m[1]}`);
  return out;
}

/** Normalise a finding's clause/segment id into the same vocabulary as parseClauseRef. */
export function findingClauseKeys(clause: string | null | undefined): Set<string> {
  const keys = parseClauseRef(clause);
  if (clause) {
    const lower = clause.toLowerCase().trim();
    keys.add(lower);
    // "10.2" also overlaps with "section 10"
    for (const k of [...keys]) {
      const m = k.match(/^(\d{1,3})\.\d+$/);
      if (m) keys.add(`section ${m[1]}`);
    }
  }
  return keys;
}

export function clausesOverlap(expected: string, found: string | null | undefined): boolean {
  const a = parseClauseRef(expected);
  const b = findingClauseKeys(found);
  for (const k of a) if (b.has(k)) return true;
  return false;
}

/** Answer-key check family → finding checks that satisfy it. */
export const CHECK_FAMILY: Record<string, string[]> = {
  clash: ["clash"],
  history: ["history", "clash"],
  baseline: ["baseline", "missing_protection", "full_read", "deal_value"],
  "baseline+deal_value": ["baseline", "deal_value", "missing_protection", "full_read"],
  deal_value: ["deal_value", "baseline", "full_read"],
  entity_law: ["entity_law"],
  full_read: ["full_read", "baseline", "missing_protection", "deal_value"],
  fairness: ["fairness", "full_read", "baseline"],
  missing_protection: ["missing_protection", "baseline", "full_read"],
  bundle_conflict: ["bundle_conflict", "delivery"],
  bundle_missing: ["bundle_missing", "missing_protection"],
  pass_down: ["pass_down"],
  note_gap: ["note_gap"],
  injection: ["injection"],
  scope_gate: ["scope"],
  // not_sure and version_diff are matched on severity / version_tag instead of check.
  not_sure: [],
  version_diff: [],
};

export function familyMatches(expectedCheck: string, findingCheck: string): boolean {
  const fam = CHECK_FAMILY[expectedCheck];
  if (!fam || fam.length === 0) return true;
  return fam.includes(findingCheck);
}

/** Quotes match when one contains the other after normalisation. */
export function quotesOverlap(expected: string, found: string | null | undefined): boolean {
  if (!found) return false;
  const n = (s: string) => s.replace(/\*\*/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  const a = n(expected);
  const b = n(found);
  if (!a || !b) return false;
  // A found quote counts if it contains the expected one, or is a substantial piece of it.
  return b.includes(a) || (b.length >= Math.min(20, a.length) && a.includes(b));
}
