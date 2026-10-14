// Company and governing-law check (O8), from seed/entities.json rules:
// - US client → AtliQ Inc; non-US client → AtliQ Technologies Pvt Ltd. Contracting and invoicing entity must match.
// - Any other "AtliQ …" name is not a real entity → serious.
// - Indian law for Pvt Ltd; a US state's law for Inc. Foreign law/courts → negotiable. Foreign language prevails → negotiable.
import type { FindingDraft } from "@/lib/pipeline/types";
import type { DealContext } from "@/lib/reference/types";
import type { Extract } from "@/lib/ai/schemas";

export type EntityId = "PVT" | "INC" | "UNKNOWN";

export function entityOf(name: string): EntityId | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (!/atliq/i.test(n)) return null; // a role word ("Supplier") or the counterparty, not an AtliQ name
  if (/^atliq\.?$/i.test(n)) return null; // bare "AtliQ": ambiguous
  if (/\bInc\b\.?/i.test(n) && !/Technologies|Private|Pvt|Global|LLP/i.test(n)) return "INC";
  if (/Technologies/i.test(n) && !/Global|Solutions|LLP|LLC|Inc\b/i.test(n)) return "PVT";
  return "UNKNOWN";
}

export const isUS = (country: string | null | undefined) =>
  !!country && /^(usa|u\.s\.a?\.?|us|united states( of america)?|america)$/i.test(country.trim());

const US_STATES =
  /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|United States|U\.S\.)\b/i;

export function lawKind(law: string | null): "india" | "us" | "foreign" | null {
  if (!law) return null;
  if (/\bIndia(n)?\b/i.test(law)) return "india";
  if (US_STATES.test(law)) return "us";
  return "foreign";
}

export function checkEntityLaw(args: { atliqNames: string[]; extract: Extract; deal: DealContext }): FindingDraft[] {
  const { atliqNames, extract, deal } = args;
  const out: FindingDraft[] = [];
  const named = atliqNames.map((n) => ({ name: n, id: entityOf(n) })).filter((x): x is { name: string; id: EntityId } => x.id !== null);

  // Not a real AtliQ company.
  for (const u of named.filter((x) => x.id === "UNKNOWN")) {
    out.push({
      check: "entity_law", category: "entity", severity: "serious", basis: "irreversible",
      title: `"${u.name}" is not one of AtliQ's companies`,
      clause: "Parties", quote: u.name, absent: false,
      whatItMeans: "AtliQ has only two companies: AtliQ Technologies Pvt Ltd and AtliQ Inc. A contract with any other AtliQ name has no valid AtliQ party.",
      whatItCouldCost: "Invoices, tax filings and enforcement can all fail; payment could be blocked entirely.",
      howToSoften: "Replace it with the correct company: AtliQ Inc for US clients, AtliQ Technologies Pvt Ltd for everyone else.",
      source: "code",
    });
  }

  const real = named.filter((x) => x.id !== "UNKNOWN");
  // The first real AtliQ company named in the document (the parties block) is the contracting party;
  // the AI's reading is only a fallback.
  const aiNamed = extract.atliq_entity_named.value ? entityOf(extract.atliq_entity_named.value) : null;
  const contracting: EntityId | null = real[0]?.id ?? (aiNamed && aiNamed !== "UNKNOWN" ? aiNamed : null);
  const contractingName = real[0]?.name ?? (aiNamed ? extract.atliq_entity_named.value : null);
  const invoicing = extract.invoicing_entity.value ? entityOf(extract.invoicing_entity.value) : null;

  // The buyer-side papers (AtliQ hires a vendor) follow the vendor's location, not a client's.
  if (deal.direction === "atliq_supplier" && contracting && contracting !== "UNKNOWN") {
    const expected: EntityId = isUS(deal.clientCountry) ? "INC" : "PVT";
    const mismatch = invoicing && invoicing !== "UNKNOWN" && invoicing !== contracting;
    if (contracting !== expected || mismatch) {
      const expectedName = expected === "INC" ? "AtliQ Inc" : "AtliQ Technologies Pvt Ltd";
      const title = mismatch
        ? `${contracting === "INC" ? "AtliQ Inc" : "AtliQ Technologies Pvt Ltd"} signs but ${invoicing === "INC" ? "AtliQ Inc" : "AtliQ Technologies Pvt Ltd"} invoices${contracting !== expected ? ` — and a ${isUS(deal.clientCountry) ? "US" : "non-US"} client needs ${expectedName}` : ""}`
        : `Wrong AtliQ company for a ${isUS(deal.clientCountry) ? "US" : "non-US"} client (${deal.clientCountry})`;
      out.push({
        check: "entity_law", category: "entity", severity: "serious", basis: "irreversible",
        title,
        clause: mismatch ? extract.invoicing_entity.clause ?? "Parties" : "Parties",
        quote: mismatch ? extract.invoicing_entity.quote : contractingName,
        absent: false,
        whatItMeans: `${expectedName} must be the contracting and invoicing company for a client in ${deal.clientCountry}.${mismatch ? " The company that signs and the company that invoices must be the same." : ""}`,
        whatItCouldCost: "A company/invoice mismatch delayed AtliQ's payments twice in 2025; the wrong company can also create tax and enforceability problems.",
        howToSoften: `Name ${expectedName} as the contracting party and have the same company raise every invoice.`,
        source: "code",
        related: { expected, contracting, invoicing },
      });
    }
  }

  // Governing law and courts.
  const law = extract.governing_law;
  const kind = lawKind(law.law);
  const lawEntity = contracting === "INC" ? "INC" : "PVT";
  const lawOk = kind === null || (lawEntity === "PVT" ? kind === "india" : kind === "us");
  if (!lawOk && law.quote) {
    out.push({
      check: "entity_law", category: "law", severity: "negotiable", basis: "bounded",
      title: `Foreign governing law: ${law.law}${law.courts ? ` (${law.courts})` : ""}`,
      clause: law.clause, quote: law.quote, absent: false,
      whatItMeans: `Disputes would be decided under ${law.law}${law.courts ? ` in ${law.courts}` : ""}, where AtliQ has no presence. AtliQ's usual is ${lawEntity === "PVT" ? "Indian law" : "a US state's law"}.`,
      whatItCouldCost: "Defending or enforcing a claim abroad means foreign lawyers and travel — often more than a small claim is worth (the Brightwater lesson).",
      howToSoften: `Ask for ${lawEntity === "PVT" ? "Indian law with arbitration seated in Pune or Mumbai" : "a US state's law"}, or neutral arbitration (e.g. SIAC) as a fallback.`,
      source: "code",
    });
  }

  const lang = extract.language_precedence;
  if (lang.language && !/english/i.test(lang.language) && lang.quote) {
    out.push({
      check: "entity_law", category: "law", severity: "negotiable", basis: "bounded",
      title: `The ${lang.language} version prevails over the English text`,
      clause: lang.clause, quote: lang.quote, absent: false,
      whatItMeans: `If the two versions differ, the ${lang.language} text wins — and AtliQ (and this review) only reads the English.`,
      whatItCouldCost: "A term AtliQ never saw in English could bind it.",
      howToSoften: "Make the English version prevail, or have the other language version checked by a qualified reviewer before signing.",
      source: "code",
    });
  }
  return out;
}
