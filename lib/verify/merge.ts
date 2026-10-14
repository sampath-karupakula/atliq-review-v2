// De-duplicates findings from code rules and the AI full read. Code facts (numbers, severities) win;
// the AI never overrides arithmetic or rules. AI duplicates of the same clause+topic keep the stronger one.
import type { FindingDraft, Severity } from "@/lib/pipeline/types";
import { findingClauseKeys } from "@/lib/eval/match";

const RANK: Record<Severity, number> = { serious: 4, negotiable: 3, not_sure: 2, minor: 1, info: 0 };

const TOPIC: Record<string, string> = {
  delay_penalty: "delay_penalty", liability: "liability", indemnity: "indemnity", ip: "ip", payment: "payment",
  termination: "termination", confidentiality: "confidentiality", restriction: "restriction", insurance: "insurance",
  law: "law", entity: "entity", data: "data", injection: "injection", warranty: "warranty",
};
/** Generic AI categories (missing_protection, fairness, other) get their topic from the title. */
const TITLE_TOPIC: [RegExp, string][] = [
  [/delay|penalt|liquidated/i, "delay_penalty"],
  [/liabilit|cap\b/i, "liability"],
  [/indemn/i, "indemnity"],
  [/\bIP\b|intellectual|tools|ownership/i, "ip"],
  [/payment|pay-when|invoice|\d+[- ]day/i, "payment"],
  [/terminat|exit/i, "termination"],
  [/confidential|NDA/i, "confidentiality"],
  [/insurance/i, "insurance"],
];
const topic = (f: FindingDraft) => {
  if (TOPIC[f.category]) return TOPIC[f.category];
  return TITLE_TOPIC.find(([re]) => re.test(f.title))?.[1] ?? f.category;
};
const section = (c: string | null) => c?.match(/(\d{1,3})\.\d/)?.[1] ?? null;

/** Topics the code rules evaluate completely from the extracted terms. */
const CODE_EVALUATED = new Set(["delay_penalty", "liability", "payment", "termination", "indemnity", "ip", "insurance", "confidentiality", "entity", "law"]);

function overlaps(a: FindingDraft, b: FindingDraft): boolean {
  const ka = findingClauseKeys(a.clause);
  const kb = findingClauseKeys(b.clause);
  const precise = (k: string) => /^\d+\.\d+$|^s\d+\.\d+$|^parties$|^title$/.test(k);
  for (const k of ka) if (precise(k) && kb.has(k)) return true;
  const q = (s: string | null) => (s ?? "").replace(/\s+/g, " ").toLowerCase().trim();
  const qa = q(a.quote);
  const qb = q(b.quote);
  return qa.length > 15 && qb.length > 15 && (qa.includes(qb) || qb.includes(qa));
}

export function mergeFindings(code: FindingDraft[], ai: FindingDraft[], opts: { evaluatedTopics: Set<string> }): FindingDraft[] {
  const out = [...code];
  for (const f of ai) {
    // Code already reports this issue (with computed numbers) on the same clause or in the same section —
    // AI findings often cite the neighbouring clause of the same rule (4.2 vs 4.3), or have no clause at all.
    const sameAsCode = out.find(
      (c) =>
        c.source === "code" &&
        topic(c) === topic(f) &&
        (overlaps(c, f) || (section(c.clause) !== null && section(c.clause) === section(f.clause)) || (f.absent && f.severity !== "serious")),
    );
    if (sameAsCode) continue;
    const dup = out.find((c) => c.source === "ai" && topic(c) === topic(f) && overlaps(c, f));
    if (dup) {
      if (RANK[f.severity] > RANK[dup.severity]) out[out.indexOf(dup)] = f;
      continue;
    }
    // The code rules looked at this topic and found it within AtliQ's usual terms: a bounded AI flag on the
    // same topic is noise (keeps clean controls quiet). Serious AI flags still go through P7 checks.
    const t = topic(f);
    if (CODE_EVALUATED.has(t) && opts.evaluatedTopics.has(t) && !out.some((c) => c.source === "code" && topic(c) === t) && f.severity !== "serious" && f.severity !== "not_sure") {
      out.push({ ...f, severity: "minor", basis: "clarity" });
      continue;
    }
    out.push(f);
  }
  return out;
}
