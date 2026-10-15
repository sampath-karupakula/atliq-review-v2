// Runs every step in-process (used by scripts/eval.ts and scripts/portfolio.ts). The API routes call the
// same step functions one request at a time and persist the state between them.
import { runGate } from "@/lib/ingest/gate";
import { AiFailedError } from "@/lib/ai/client";
import { MaskingLeakError } from "@/lib/privacy/leakcheck";
import type { DealContext, Reference } from "@/lib/reference/types";
import { bundleStep, checksStep, clashStep, extractStep, finalizeStep, scanStep, startReview, type CallNote, type StepOptions } from "./steps";
import type { LinkedDoc } from "@/lib/checks/bundle";
import { applyVersionDiff, type PreviousFinding } from "./versions";
import type { ReviewReport } from "./types";

export type RunInput = {
  text: string;
  deal: DealContext;
  ref: Reference;
  linkedToDeal?: boolean;
  linkedTitles?: string[];
  linked?: LinkedDoc[];
  /** Call notes on the deal, compared with the contract (AI-6). */
  notes?: CallNote[];
  /** The previous version's text and findings (a returned draft): the new report is tagged new/unchanged/resolved. */
  previous?: { text: string; findings: PreviousFinding[] };
  findByHash?: (hash: string) => string | null | Promise<string | null>;
  onProgress?: (step: string, detail?: string) => void;
} & StepOptions;

const emptyReport = (extra: Partial<ReviewReport>): ReviewReport => ({
  status: "failed",
  score: null,
  band: null,
  counts: { serious: 0, negotiable: 0, minor: 0, not_sure: 0, info: 0 },
  summary: [],
  summarySource: "code",
  findings: [],
  clausesRead: 0,
  clausesFound: 0,
  coverageLine: "",
  registerLine: "",
  docType: "other",
  model: null,
  provider: null,
  tokensIn: 0,
  tokensOut: 0,
  ...extra,
});

export async function runReview(input: RunInput): Promise<ReviewReport> {
  const progress = input.onProgress ?? (() => {});
  progress("reading");
  const gate = await runGate({ text: input.text, linkedToDeal: Boolean(input.linkedToDeal), findByHash: input.findByHash });
  if (!gate.ok) {
    return emptyReport({ status: "stopped", stop: { code: gate.stop, message: gate.message, duplicateOf: gate.duplicateOf ?? null }, docType: gate.docType ?? "other" });
  }
  try {
    progress("masking");
    const state = startReview({
      text: gate.text, deal: input.deal, docType: gate.docType, title: gate.title, atliqNames: gate.atliqNames,
      ref: input.ref, linkedTitles: input.linkedTitles, linked: input.linked, notes: input.notes, config: input.config,
    });
    for (;;) {
      const p = await extractStep(state, input.ref, input);
      progress("extracting", `${p.completed}/${p.total}`);
      if (p.done) break;
    }
    progress("checking");
    checksStep(state);
    progress("checking against AtliQ's promises");
    await clashStep(state, input.ref, input);
    for (;;) {
      const p = await scanStep(state, input.ref, input);
      progress("reading every clause", `${p.completed}/${p.total}`);
      if (p.done) break;
    }
    progress("checking the deal bundle");
    await bundleStep(state, input.ref, input);
    progress("verifying");
    const report = await finalizeStep(state, input.ref, gate.text, input);
    return input.previous ? applyVersionDiff(report, gate.text, input.previous.findings, input.previous.text) : report;
  } catch (err) {
    // G10: fail closed with a clear message, never a partial report.
    const message =
      err instanceof MaskingLeakError || err instanceof AiFailedError ? err.message : `Review failed — review manually. (${err instanceof Error ? err.message : String(err)})`;
    return emptyReport({ status: "failed", error: message, docType: gate.docType });
  }
}
