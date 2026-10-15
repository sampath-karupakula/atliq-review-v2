// Masking (G2). One Masker per review, so the same name gets the same label in every prompt
// (contract text, register reference, linked documents). The key never leaves the server.
//
// Labels: one per entity (CLIENT_A, PARTY_B, PERSON_3 …). Each distinct way the entity is written gets a
// numbered variant (CLIENT_A, CLIENT_A_2 for "KAVERI RETAIL PRIVATE LIMITED" vs "Kaveri"), so the model sees
// one party while unmasking restores the exact original text — which quote verification depends on.
import { detectPii, isAllowed, type PiiKind } from "./patterns";
import { ATLIQ_PEOPLE, definedShortNames, harvestOrgs, harvestPeople, orgVariants, peopleFromEmails, stripOrgSuffix } from "./names";

export type TokenKind = "CLIENT" | "PARTY" | "PERSON" | PiiKind;

export type MaskerOptions = {
  /** The counterparty (and any other party to this deal), from the upload form or seed data. */
  counterparties?: string[];
  /** Other organisations to mask: register contracts and current clients. */
  otherOrgs?: string[];
  /** Extra people to mask (e.g. known contacts). AtliQ's own people are always included. */
  people?: string[];
};

type DictEntry = { value: string; entity: string; caseSensitive: boolean };

export const TOKEN_RE = /\b(?:CLIENT|PARTY)_[A-Z]{1,2}(?:_\d+)?\b|\b(?:PERSON|EMAIL|PHONE|ID|ACCOUNT|ADDRESS|URL|REF)_\d+(?:_\d+)?\b/g;

function letterLabel(n: number): string {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export class Masker {
  private counters: Record<TokenKind, number> = { CLIENT: 0, PARTY: 0, PERSON: 0, EMAIL: 0, PHONE: 0, ID: 0, ACCOUNT: 0, ADDRESS: 0, URL: 0, REF: 0 };
  private entityByKey = new Map<string, string>(); // kind:normalised name → entity label
  private surfaceToToken = new Map<string, string>(); // exact surface text → token
  private originalByToken = new Map<string, string>(); // token → exact surface text
  private variantsUsed = new Map<string, number>(); // entity label → variants issued
  private dict: DictEntry[] = [];
  /** Every original string that was masked (names and regex hits); used by the leak check. */
  readonly maskedOriginals = new Set<string>();

  constructor(private opts: MaskerOptions = {}) {
    for (const c of opts.counterparties ?? []) this.addOrg(c, "CLIENT");
    for (const o of opts.otherOrgs ?? []) this.addOrg(o, "PARTY");
    for (const p of [...ATLIQ_PEOPLE, ...(opts.people ?? [])]) this.addPerson(p);
  }

  private newEntity(kind: TokenKind): string {
    const n = this.counters[kind]++;
    return kind === "CLIENT" || kind === "PARTY" ? `${kind}_${letterLabel(n)}` : `${kind}_${n + 1}`;
  }

  private entityFor(kind: TokenKind, name: string): string {
    const key = `${kind}:${norm(name)}`;
    let e = this.entityByKey.get(key);
    if (!e) {
      e = this.newEntity(kind);
      this.entityByKey.set(key, e);
    }
    return e;
  }

  /** The token for one exact way of writing an entity. */
  private surfaceToken(entity: string, surface: string): string {
    const existing = this.surfaceToToken.get(surface);
    if (existing) return existing;
    const used = this.variantsUsed.get(entity) ?? 0;
    const token = used === 0 ? entity : `${entity}_${used + 1}`;
    this.variantsUsed.set(entity, used + 1);
    this.surfaceToToken.set(surface, token);
    this.originalByToken.set(token, surface);
    return token;
  }

  private addDict(value: string, entity: string, caseSensitive: boolean) {
    const v = value.trim();
    if (v.length < 3) return;
    if (this.dict.some((d) => norm(d.value) === norm(v))) return;
    this.dict.push({ value: v, entity, caseSensitive });
  }

  private knownEntity(values: string[]): string | undefined {
    for (const v of values) {
      const hit = this.dict.find((d) => norm(d.value) === norm(v));
      if (hit) return hit.entity;
    }
    return undefined;
  }

  /** An organisation and its short forms all belong to one entity. */
  addOrg(name: string, kind: "CLIENT" | "PARTY" = "PARTY") {
    const variants = orgVariants(name);
    if (variants.length === 0) return;
    const entity = this.knownEntity(variants) ?? this.entityFor(kind, stripOrgSuffix(name) || name);
    for (const v of variants) this.addDict(v, entity, false);
  }

  /** A person: full name, plus surname and first name alone when distinctive. */
  addPerson(name: string) {
    const full = name.replace(/\s+/g, " ").trim();
    if (!full) return;
    const words = full.split(" ");
    const entity = this.knownEntity([full]) ?? this.entityFor("PERSON", full);
    this.addDict(full, entity, words.length === 1);
    if (words.length >= 2) {
      const last = words[words.length - 1];
      const first = words[0];
      if (last.length >= 4) this.addDict(last, entity, true);
      if (first.length >= 4) this.addDict(first, entity, true);
    }
  }

  /** Mask a document: learn names from it, then replace regex hits and dictionary names with labels. */
  mask(text: string): string {
    // 1. Learn from this document.
    const hits = detectPii(text);
    const emails = hits.filter((h) => h.kind === "EMAIL").map((h) => h.value);
    const docOrgs = harvestOrgs(text);
    const counterpartyKind = this.opts.counterparties?.length ? "PARTY" : "CLIENT";
    for (const org of docOrgs) this.addOrg(org, counterpartyKind);
    const orgNames = [...(this.opts.counterparties ?? []), ...docOrgs];
    for (const short of definedShortNames(text, orgNames)) {
      const owner = orgNames.find((o) => norm(o).includes(norm(short).split(" ")[0]));
      const entity = owner ? this.knownEntity(orgVariants(owner)) : undefined;
      if (entity) this.addDict(short, entity, false);
      else this.addOrg(short, "PARTY");
    }
    for (const p of [...harvestPeople(text), ...peopleFromEmails(text, emails)]) this.addPerson(p);
    // The client's web domain, learned from its email addresses ("harringtonhealth.com"), written on its own.
    for (const domain of new Set(emails.map((e) => e.split("@")[1]!.toLowerCase()))) {
      if (!isAllowed(domain) && domain.includes(".")) this.addDict(domain, this.entityFor("URL", domain), false);
    }

    // 2. Regex hits first (so names inside emails go with the email), longest first. Re-scan until clean:
    //    an address can run past its first postcode-like number ("P.O. Box 88214, Riyadh 11662").
    let out = text;
    let pass = hits;
    for (let i = 0; i < 4 && pass.length > 0; i++) {
      const values = [...new Map(pass.map((h) => [h.value, h])).values()].sort((a, b) => b.value.length - a.value.length);
      for (const h of values) {
        if (!out.includes(h.value)) continue;
        const entity = this.entityFor(h.kind, h.value);
        const token = this.surfaceToken(entity, h.value);
        this.maskedOriginals.add(this.unmask(h.value));
        out = out.split(h.value).join(token);
      }
      pass = detectPii(out);
    }

    // 3. Dictionary names, longest first, on word boundaries. Existing labels are never touched.
    for (const d of [...this.dict].sort((a, b) => b.value.length - a.value.length)) {
      const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(d.value)}(?![A-Za-z0-9_])`, d.caseSensitive ? "g" : "gi");
      out = out.replace(re, (surface) => {
        this.maskedOriginals.add(surface);
        return this.surfaceToken(d.entity, surface);
      });
    }
    return out;
  }

  /** Replace labels with the exact original strings (for display and quote verification only). */
  unmask(text: string): string {
    // Labels can nest (an address label that contains an earlier address label), so resolve until stable.
    let out = text;
    for (let i = 0; i < 4; i++) {
      const next = out.replace(TOKEN_RE, (t) => this.originalByToken.get(t) ?? t);
      if (next === out) break;
      out = next;
    }
    return out;
  }

  /** Dictionary strings the leak check must not find in masked output. */
  dictionaryValues(): { value: string; caseSensitive: boolean }[] {
    return this.dict.map(({ value, caseSensitive }) => ({ value, caseSensitive }));
  }

  /** token → original, for the masking_keys table. Never logged, never sent to the model. */
  keyEntries(): { token: string; original: string }[] {
    return [...this.originalByToken.entries()].map(([token, original]) => ({ token, original }));
  }

  /** Rebuild a masker from a stored key (for unmasking AI output in later pipeline steps). */
  static fromKey(entries: { token: string; original: string }[], opts: MaskerOptions = {}): Masker {
    const m = new Masker(opts);
    for (const { token, original } of entries) {
      m.originalByToken.set(token, original);
      m.surfaceToToken.set(original, token);
      m.maskedOriginals.add(original);
      // Names (not regex hits) go back into the dictionary so re-masking and the leak check still work.
      if (/^(?:CLIENT|PARTY|PERSON)_/.test(token) && !TOKEN_RE.test(original)) {
        const entity = token.match(/^((?:CLIENT|PARTY)_[A-Z]+|PERSON_\d+)/)![1];
        if (!m.dict.some((d) => d.value === original)) m.dict.push({ value: original, entity, caseSensitive: true });
      }
      TOKEN_RE.lastIndex = 0;
    }
    return m;
  }
}
