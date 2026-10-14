// Where an interrupted or failed review can carry on from, based on the last step it saved (lib/data/reviews.ts).
// Finished steps are kept in reviews.artifacts.state, so resuming repeats no paid AI call that already succeeded.

export const PIPELINE_STEPS = ["extract", "checks", "clash", "scan", "bundle", "finalize"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export function resumePoint(savedStep: string | null | undefined): PipelineStep | null {
  const s = (savedStep ?? "").trim();
  if (s === "masked" || s.startsWith("extracting")) return "extract";
  if (s === "extracted") return "checks";
  if (s === "checked") return "clash";
  if (s === "clash checked" || s.startsWith("scanning")) return "scan";
  if (s === "scanned") return "bundle";
  if (s === "bundle checked") return "finalize";
  return null; // not started (masking failed) or already done
}

/** The saved step in words, for "a review is in progress (now at: …)". */
export function stepText(savedStep: string | null | undefined): string {
  const s = (savedStep ?? "").trim();
  const part = s.match(/(\d+)\/(\d+)/);
  const of = part ? ` (part ${+part[1] + 1} of ${part[2]})` : "";
  if (s === "masking") return "hiding names";
  if (s === "masked" || s.startsWith("extracting")) return `pulling out the key terms${of}`;
  if (s === "extracted") return "checking company, law and usual terms";
  if (s === "checked") return "checking past promises";
  if (s === "clash checked" || s.startsWith("scanning")) return `reading every clause${of}`;
  if (s === "scanned") return "checking the other deal documents";
  if (s === "bundle checked") return "verifying quotes and scoring";
  return s || "starting";
}
