// Search past contracts (feature 31): every clause of every signed contract on file, expired ones included.
// Pure: the page passes the contracts in. Matching ignores case and punctuation, so "45 days" finds
// "forty-five (45) days'"; a clause matches only when every word of the query is in it, and an exact phrase ranks first.
import { splitClauses } from "@/lib/ingest/clauses";

export type ClauseType = "payment" | "liability" | "penalty" | "restriction" | "ip" | "confidentiality" | "termination" | "law" | "data" | "other";

export const CLAUSE_TYPES: [ClauseType, string][] = [
  ["payment", "Payment"],
  ["liability", "Liability and indemnity"],
  ["penalty", "Delay penalties"],
  ["restriction", "Restrictions"],
  ["ip", "IP"],
  ["confidentiality", "Confidentiality"],
  ["termination", "Termination"],
  ["law", "Law and disputes"],
  ["data", "Data protection"],
];

// Checked in order: the first rule whose words appear in the section heading wins, then the clause text.
const TYPE_RULES: [ClauseType, RegExp][] = [
  ["penalty", /liquidated|penalt|service credit/i],
  ["restriction", /non-?compet|exclusiv|non-?solicit|most favou?red|best price|restrict/i],
  ["liability", /liabilit|indemn/i],
  ["payment", /payment|invoice|fees|\bpay\b|rate card/i],
  ["ip", /intellectual property|\bip\b|ownership|work product|licen[cs]e/i],
  ["confidentiality", /confidential|non-?disclosure/i],
  ["termination", /terminat|expiry|renewal/i],
  ["law", /governing law|arbitration|jurisdiction|dispute/i],
  ["data", /personal data|data protection|\bphi\b|hipaa|business associate|privacy/i],
];

export function clauseType(section: string | null, text: string): ClauseType {
  for (const [t, re] of TYPE_RULES) if (section && re.test(section)) return t;
  for (const [t, re] of TYPE_RULES) if (re.test(text)) return t;
  return "other";
}

export type SearchDoc = { id: string; title: string; counterparty: string; signedDate: string | null; inForce: boolean; text: string };
export type SearchFilters = { type?: ClauseType | "all"; status?: "all" | "in_force" | "expired" };
export type SearchHit = {
  contractId: string;
  title: string;
  counterparty: string;
  signedDate: string | null;
  inForce: boolean;
  clause: string;
  section: string | null;
  type: ClauseType;
  text: string;
  exact: boolean;
};

/** Lower case, punctuation to spaces, single-spaced, padded so whole-word checks can use " word ". */
export function normalise(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[*_#|>]/g, " ")
    .replace(/[^a-z0-9%$€£.]+/g, " ")
    .replace(/(\D)\.|\.(\D|$)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export function searchClauses(docs: SearchDoc[], query: string, f: SearchFilters = {}, limit = 60): SearchHit[] {
  const q = normalise(query.replace(/["“”]/g, " "));
  const words = q.trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const d of docs) {
    if (f.status === "in_force" && !d.inForce) continue;
    if (f.status === "expired" && d.inForce) continue;
    for (const s of splitClauses(d.text).segments) {
      if (s.kind === "title" || s.kind === "heading") continue;
      const n = normalise(s.text);
      if (!words.every((w) => n.includes(` ${w} `))) continue;
      const type = clauseType(s.section, s.text);
      if (f.type && f.type !== "all" && type !== f.type) continue;
      hits.push({
        contractId: d.id,
        title: d.title,
        counterparty: d.counterparty,
        signedDate: d.signedDate,
        inForce: d.inForce,
        clause: s.id,
        section: s.section,
        type,
        text: s.text.replace(/\*\*/g, "").trim(),
        exact: n.includes(q),
      });
    }
  }
  return hits
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.inForce) - Number(a.inForce) || (b.signedDate ?? "").localeCompare(a.signedDate ?? ""))
    .slice(0, limit);
}
