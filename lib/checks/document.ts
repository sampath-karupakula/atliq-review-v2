// Document-level code checks: missing referenced attachments (R-REF), text addressed to AI reviewers
// (injection backup to G3), and OCR-damaged clauses (never guess a value).
import type { FindingDraft } from "@/lib/pipeline/types";
import type { ClauseMap } from "@/lib/ingest/clauses";
import type { Extract } from "@/lib/ai/schemas";

/** "Schedule 7 (Liability Caps)" → { word: "schedule", id: "7" } */
function attachmentId(name: string): { word: string; id: string } | null {
  const m = name.match(/\b(schedule|annex(?:ure)?|exhibit|appendix|attachment)\s+([A-Z0-9]+)\b/i);
  return m ? { word: m[1].toLowerCase().replace(/ure$/, ""), id: m[2].toUpperCase() } : null;
}

/** True if the document itself contains a heading for that attachment. */
export function attachmentPresent(map: ClauseMap, name: string): boolean {
  const ref = attachmentId(name);
  if (!ref) return false;
  return map.segments.some((s) => {
    if (s.kind !== "heading" && s.kind !== "title") return false;
    const h = s.text.replace(/[#*]/g, "").trim();
    const m = h.match(/^(schedule|annex(?:ure)?|exhibit|appendix|attachment)\s+([A-Z0-9]+)\b/i);
    return !!m && m[1].toLowerCase().replace(/ure$/, "") === ref.word && m[2].toUpperCase() === ref.id;
  });
}

/** The kind of agreement a reference names, so a linked document of that type counts as "attached". */
function referencedType(name: string): string | null {
  if (/business associate|\bBAA\b/i.test(name)) return "baa";
  if (/data processing|\bDPA\b|article 28/i.test(name)) return "dpa";
  if (/non-?disclosure|\bNDA\b/i.test(name)) return "nda";
  if (/statement of work|\bSOW\b/i.test(name)) return "sow";
  if (/master (?:services )?agreement|\bMSA\b/i.test(name)) return "msa";
  return null;
}

export function checkReferences(extract: Extract, map: ClauseMap, linkedTitles: string[] = [], linkedTypes: string[] = []): FindingDraft[] {
  const out: FindingDraft[] = [];
  const seen = new Set<string>();
  for (const d of extract.referenced_documents) {
    const key = (attachmentId(d.name) ? `${attachmentId(d.name)!.word} ${attachmentId(d.name)!.id}` : d.name).toLowerCase();
    if (seen.has(key) || !d.quote) continue;
    seen.add(key);
    // Present in this document, or supplied as a linked document in the deal bundle → nothing missing.
    if (attachmentPresent(map, d.name) || d.present_in_text) continue;
    if (linkedTitles.some((t) => t.toLowerCase().includes(key) || key.includes(t.toLowerCase()))) continue;
    const t = referencedType(d.name);
    if (t && linkedTypes.includes(t)) continue;

    if (d.governs === "liability" || d.governs === "price") {
      out.push({
        check: "bundle_missing", category: d.governs === "liability" ? "liability" : "payment", severity: "not_sure", basis: "uncertain",
        title: `${d.name} is referred to but not attached — the ${d.governs === "liability" ? "liability cap" : "price"} is unknown`,
        clause: d.clause, quote: d.quote, absent: false,
        whatItMeans: `The contract relies on ${d.name} for the ${d.governs === "liability" ? "cap on AtliQ's liability" : "pricing"}, but it is not in the document. The value is not guessed.`,
        whatItCouldCost: "Unknown until the attachment is seen.",
        howToSoften: `Ask for ${d.name} before reviewing further.`,
        source: "code",
      });
    } else {
      // Serious only when the missing document governs personal data (a DPA, a BAA, data-processing terms);
      // external security or IT policies "as updated from time to time" are a bounded, negotiable point.
      const data = d.governs === "data" || (d.governs === "security" && /\b(data processing|personal data|business associate|BAA|DPA|PHI|transfer)\b/i.test(d.name));
      // A partner portal or published product documentation is an online resource, not a document a contract
      // attaches; worth knowing, not a gap (TC16).
      if (!data && /\b(portal|website|web site|online|published documentation|product documentation|knowledge base|help cent(?:re|er))\b/i.test(d.name)) {
        out.push({
          check: "bundle_missing", category: "other", severity: "minor", basis: "clarity",
          title: `${d.name} is referred to (an online resource)`,
          clause: d.clause, quote: d.quote, absent: false,
          whatItMeans: `The contract points to ${d.name}. It is an online resource rather than terms attached to the contract.`,
          whatItCouldCost: "Little, unless it is later used to add obligations.",
          howToSoften: `Check that ${d.name} cannot add obligations without AtliQ agreeing in writing.`,
          source: "code",
        });
        continue;
      }
      out.push({
        check: "bundle_missing", category: data ? "data" : "other", severity: data ? "serious" : "negotiable", basis: data ? "irreversible" : "bounded",
        title: `${d.name} is referred to but missing`,
        clause: d.clause, quote: d.quote, absent: false,
        whatItMeans: `The contract incorporates ${d.name}, but it was not provided. AtliQ would be agreeing to terms it has not seen${data ? " — and these govern how personal data is handled" : ""}.`,
        whatItCouldCost: data ? "Data-protection obligations (and fines) AtliQ cannot check; data must not move until it is agreed." : "Obligations AtliQ has not read.",
        howToSoften: `Ask for ${d.name} and review it before signing.`,
        source: "code",
      });
    }
  }
  return out;
}

const AI_DIRECTED = /\b(?:note|instruction|message|direction)s?\s+(?:to|for)\s+(?:any\s+)?(?:ai|a\.i\.|artificial intelligence|automated|llm|language model|review tool|contract review (?:tool|software)|software)\b|\bignore (?:all |any )?(?:previous|prior) instructions\b|\b(?:ai|automated) (?:contract )?review(?:er|ers| tools?)? (?:must|should|shall)\b/i;

export function checkInjection(originalText: string, map: ClauseMap, extract: Extract | null): FindingDraft[] {
  const found = new Map<string, { clause: string | null; quote: string }>();
  for (const s of map.segments) {
    const m = s.text.match(AI_DIRECTED);
    if (!m) continue;
    // Quote the sentence containing the match, verbatim.
    const idx = s.text.indexOf(m[0]);
    const start = Math.max(0, s.text.lastIndexOf(".", idx) + 1);
    const endDot = s.text.indexOf(".", idx + m[0].length);
    const quote = s.text.slice(start, endDot > 0 ? Math.min(endDot + 1, start + 220) : start + 220).replace(/^\s*[*#\d. ]*\**/, "").trim();
    found.set(s.id, { clause: s.id, quote });
  }
  for (const a of extract?.ai_directed_text ?? []) {
    const clause = a.clause?.replace(/^\[|\]$/g, "").trim() ?? null;
    // One finding per clause: code may already have found the same text with a slightly different quote.
    if (!a.quote || (clause && found.has(clause))) continue;
    if ([...found.values()].some((f) => f.quote.includes(a.quote!) || a.quote!.includes(f.quote))) continue;
    found.set(clause ?? `ai:${found.size}`, { clause, quote: a.quote });
  }
  void originalText;
  return [...found.values()].map((f) => ({
    check: "injection" as const, category: "injection", severity: "not_sure" as const, basis: "uncertain" as const,
    title: "Text addressed to automated reviewers was found and ignored",
    clause: f.clause, quote: f.quote, absent: false,
    whatItMeans: "The document contains instructions aimed at AI review tools. They were not followed. A contract has no reason to address software — read the surrounding clauses yourself.",
    whatItCouldCost: "It may be trying to hide or downplay a risky clause.",
    howToSoften: "Ask the other side to remove it, and check the clauses it refers to manually.",
    source: "code" as const,
  }));
}

export function checkUnreadable(map: ClauseMap): FindingDraft[] {
  return map.unreadable
    .map((id) => map.segments.find((s) => s.id === id)!)
    .filter(Boolean)
    .map((s) => ({
      check: "full_read" as const, category: "other", severity: "not_sure" as const, basis: "uncertain" as const,
      title: `Clause ${s.id} is partly unreadable (scan damage)`,
      clause: s.id,
      quote: s.text.slice(0, Math.min(s.text.length, 180)),
      absent: false,
      whatItMeans: "Some characters could not be read, so numbers in this clause (rates, caps, dates) are not known. They were not guessed.",
      whatItCouldCost: "Unknown until the original is checked.",
      howToSoften: "Ask for a clean copy and check this clause against the original.",
      source: "code" as const,
    }));
}
