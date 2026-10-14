// Risk score (ROADMAP §7.6), shown on screen with its formula:
//   min(100, 20×serious + 10×negotiable + 2×minor + 2×not_sure); 0–29 Low, 30–59 Medium, 60+ High;
//   any serious finding or live clash → at least High.
import type { Band, Severity } from "@/lib/pipeline/types";

export const SCORE_FORMULA = "min(100, 20×Serious + 10×Negotiable + 2×Minor + 2×Not sure) · 0–29 Low · 30–59 Medium · 60+ High · any Serious → High";

export function scoreOf(counts: Record<Severity, number>): { score: number; band: Band } {
  const raw = 20 * counts.serious + 10 * counts.negotiable + 2 * counts.minor + 2 * counts.not_sure;
  const score = Math.min(100, raw);
  let band: Band = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  if (counts.serious > 0) band = "High";
  return { score, band };
}

export function countSeverities(findings: { severity: Severity; dismissed?: boolean }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { serious: 0, negotiable: 0, minor: 0, not_sure: 0, info: 0 };
  for (const f of findings) if (!f.dismissed) counts[f.severity] += 1;
  return counts;
}
