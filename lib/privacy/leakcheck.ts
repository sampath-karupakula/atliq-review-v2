// Leak check (G2): after masking, nothing that was masked — and nothing that still looks like PII — may remain.
// A leak blocks the AI call; the review fails with "masking leak". Reports never include the leaked value.
import { detectPii } from "./patterns";
import type { Masker } from "./mask";

export type Leak = { kind: string; detector: string; length: number };
export type LeakReport = { ok: boolean; leaks: Leak[] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function leakCheck(masked: string, masker: Masker): LeakReport {
  const leaks: Leak[] = [];
  for (const d of masker.dictionaryValues()) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(d.value)}(?![A-Za-z0-9_])`, d.caseSensitive ? "" : "i");
    if (re.test(masked)) leaks.push({ kind: "NAME", detector: "dictionary", length: d.value.length });
  }
  for (const original of masker.maskedOriginals) {
    if (original.length >= 6 && masked.includes(original)) leaks.push({ kind: "VALUE", detector: "masked_original", length: original.length });
  }
  for (const h of detectPii(masked)) leaks.push({ kind: h.kind, detector: h.detector, length: h.value.length });
  return { ok: leaks.length === 0, leaks };
}

export class MaskingLeakError extends Error {
  constructor(public report: LeakReport) {
    super(`Masking leak: ${report.leaks.length} item(s) would have reached the AI (${[...new Set(report.leaks.map((l) => l.detector))].join(", ")}). The AI call was blocked.`);
  }
}

/** Throws MaskingLeakError if the masked text still contains anything sensitive. */
export function assertNoLeak(masked: string, masker: Masker): void {
  const report = leakCheck(masked, masker);
  if (!report.ok) throw new MaskingLeakError(report);
}
