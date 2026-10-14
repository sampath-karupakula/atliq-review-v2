export type DocType =
  | "msa" | "sow" | "nda" | "baa" | "dpa" | "partnership" | "subcontract"
  | "freelancer" | "employee" | "recruiter" | "waiver" | "other";

/** Ordered: the first match wins, so more specific titles come first. */
const RULES: [RegExp, DocType][] = [
  [/BUSINESS ASSOCIATE/i, "baa"],
  [/DATA PROCESSING/i, "dpa"],
  [/NON-?DISCLOSURE|CONFIDENTIALITY AGREEMENT|\bNDA\b/i, "nda"],
  [/STATEMENT OF WORK|\bSOW\b/i, "sow"],
  [/SUBCONTRACT/i, "subcontract"],
  [/INDEPENDENT CONTRACTOR|FREELANCE|CONSULTANCY AGREEMENT FOR AN INDIVIDUAL/i, "freelancer"],
  [/EMPLOYMENT (AGREEMENT|CONTRACT)|OFFER LETTER/i, "employee"],
  [/RECRUIT|STAFFING AGENCY|PLACEMENT AGREEMENT/i, "recruiter"],
  [/PARTNER(SHIP)? (PROGRAM|AGREEMENT)|REFERRAL PARTNER|RESELLER/i, "partnership"],
  [/WAIVER|CONSENT LETTER/i, "waiver"],
  [/MASTER|SERVICES AGREEMENT|SERVICE AGREEMENT|PILOT|SOFTWARE DEVELOPMENT|DIENSTLEISTUNG|RETAINER/i, "msa"],
];

/** Detect the document type from its first `# ` title (falls back to the first 400 characters). */
export function detectDocType(text: string): { docType: DocType; title: string } {
  const title =
    text.match(/^#[ \t]+(.+)$/m)?.[1]?.replace(/\*\*/g, "").trim() ??
    // No Markdown title (plain text or PDF): the first line written in capitals, else the first 400 characters.
    text.match(/^[ \t]*([A-Z][A-Z0-9 ,.&'’()—–-]{8,120})[ \t]*$/m)?.[1]?.trim() ??
    text.slice(0, 400);
  for (const [re, t] of RULES) if (re.test(title)) return { docType: t, title };
  return { docType: "other", title };
}

/** Freelancer, employee and recruiter agreements are out of scope as standalone deals (R-SCOPE). */
export const OUT_OF_SCOPE_ALONE: DocType[] = ["freelancer", "employee", "recruiter"];

// Any "AtliQ …" company name, in any case: AtliQ Inc, ATLIQ TECHNOLOGIES PRIVATE LIMITED, AtliQ Global Solutions LLP …
const ATLIQ_NAME =
  /\bAtliQ(?:\s+(?:Technologies|Global|Solutions|Inc\.?|Private|Pvt\.?|Ltd\.?|Limited|LLP|LLC|Labs|Digital|Services|Consulting|Holdings|Group))*/gi;

/** Every distinct AtliQ name in the document, normalised to single spaces. */
export function findAtliqNames(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(ATLIQ_NAME)) names.add(m[0].replace(/\s+/g, " ").replace(/[.,]+$/, "").trim());
  return [...names];
}

export function atliqIsParty(text: string): boolean {
  return findAtliqNames(text).length > 0;
}

// Very common English function words. English contracts score ~0.25–0.35; German ~0.02.
const EN = new Set(
  "the of and to in a an or by for be shall any this that with is are as on such its it all not no from under which at other each may will".split(" "),
);

/** Share of words that are common English function words. OCR-damaged English stays well above the threshold. */
export function englishRatio(text: string): number {
  const words = text.toLowerCase().match(/[a-zäöüßéèàçñ]+/g) ?? [];
  if (words.length === 0) return 0;
  return words.filter((w) => EN.has(w)).length / words.length;
}

export const ENGLISH_THRESHOLD = 0.08;
