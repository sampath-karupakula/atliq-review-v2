// Shared fixtures for unit tests: the read-only test corpus and answer key.
import { readFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..");

export type ExpectedCase = {
  id: string;
  title_short?: string;
  kind: string;
  band: string;
  file: string;
  clauses_numbered: number;
  deal: { linked?: string[]; bundle?: string; direction?: string; [k: string]: unknown };
  must_catch?: { check: string; severity: string; clause: string; quote: string; why: string }[];
  must_not?: string[];
  pii_must_not_reach_ai?: string[];
};

export type ExpectedResults = {
  cases: ExpectedCase[];
  edge_fixtures: { file: string; expect: string }[];
  format_variants: { file: string; same_as: string; tests: string }[];
};

export const expected = (): ExpectedResults =>
  JSON.parse(readFileSync(path.join(ROOT, "test_contracts/expected_results.json"), "utf8"));

export const readCorpus = (rel: string): string => readFileSync(path.join(ROOT, "test_contracts", rel), "utf8");
