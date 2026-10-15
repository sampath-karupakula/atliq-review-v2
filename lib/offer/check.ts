// "Can I offer this?" (feature 29): before a call, a seller types what they are about to offer and gets an answer
// from AtliQ's live promises (the register) and usual terms. Rules only, no AI, so it answers as you type.
// Pure: the page passes the register and the baseline in.
import { formatDate } from "@/lib/checks/dates";
import { mainClause } from "@/lib/deal/checklist";

export type OfferPromise = {
  id: string;
  type: string;
  contract: string;
  clauses: string[];
  territory: string[];
  domain: string;
  activity: string;
  ends: string | null;
  status: "live" | "expired" | "permanent";
  rates: Record<string, number> | null;
  assets: string[];
  waiverScopes: string[];
};
export type OfferTerm = { term: string; usual: string; hardLine: string | null };
export type Verdict = "stop" | "warn" | "ok";
export type Answer = { verdict: Verdict; head: string; body: string; source: string; ruleId: string };

export const VERDICT_LABEL: Record<Verdict, string> = { stop: "Don't offer", warn: "Check first", ok: "OK to offer" };

// Words that put a request inside a promise's field. Keys are words from the promise's domain.
const FIELD_WORDS: Record<string, RegExp> = {
  hospitality: /\b(hotels?|resorts?|hospitality|serviced apartments?|guest analytics|revenue management)\b/i,
  travel: /\b(travel|ota|online travel|booking)\b/i,
  platform: /\b(platform|lakehouse|data ?warehouse|snowflake|databricks|bigquery|fabric|redshift|partner(ship)?)\b/i,
};
const PLACE_ALIASES: Record<string, RegExp> = {
  UAE: /\b(uae|emirates|dubai|abu dhabi|sharjah)\b/i,
  "Saudi Arabia": /\b(saudi|ksa|riyadh|jeddah)\b/i,
  Qatar: /\b(qatar|doha)\b/i,
  Kuwait: /\bkuwait\b/i,
  Bahrain: /\b(bahrain|manama)\b/i,
  Oman: /\b(oman|muscat)\b/i,
  India: /\b(india|indian|mumbai|delhi|bangalore|bengaluru|pune|hyderabad|chennai)\b/i,
};
const GCC = /\b(gcc|gulf|middle east)\b/i;
const GCC_PLACES = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"];

const where = (p: OfferPromise) => `${p.contract} · Clause ${mainClause(p.clauses) ?? "?"}${p.status === "permanent" ? " · permanent" : p.ends ? ` · ${p.status === "expired" ? "ended" : "live until"} ${formatDate(p.ends)}` : ""}`;

function placesIn(q: string): string[] {
  const out = Object.entries(PLACE_ALIASES)
    .filter(([, re]) => re.test(q))
    .map(([k]) => k);
  if (GCC.test(q)) out.push(...GCC_PLACES.filter((p) => !out.includes(p)));
  return out;
}

function fieldMatch(p: OfferPromise, q: string): boolean {
  return Object.entries(FIELD_WORDS).some(([k, re]) => p.domain.toLowerCase().includes(k) && re.test(q));
}

function rateRole(q: string, roles: string[]): string | null {
  const s = q.toLowerCase();
  if (/\bsenior\b/.test(s)) return roles.find((r) => /senior/i.test(r)) ?? null;
  if (/\bbi\b|power bi|tableau|dashboard/.test(s)) return roles.find((r) => /\bBI\b/.test(r)) ?? null;
  if (/engineer/.test(s)) return roles.find((r) => /^data engineer$/i.test(r)) ?? null;
  return null;
}

export function checkOffer(query: string, promises: OfferPromise[], terms: OfferTerm[], coverage: { onFile: number; signedInTracker: number }): Answer[] {
  const q = query.trim();
  if (!q) return [];
  const s = q.toLowerCase();
  const out: Answer[] = [];
  const term = (t: string) => terms.find((x) => x.term === t);

  // 1. Rates against any live best-price promise.
  const rate = s.match(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|\$)?\s*(?:\/|per|an?)\s*(?:hr|hour|h)\b/);
  const v = rate ? Number(rate[1] ?? rate[2]) : null;
  if (v !== null || /\b(rate|discount|cheaper|lower price|hourly)\b/.test(s)) {
    for (const p of promises.filter((x) => x.type === "best_price" && x.status !== "expired" && x.rates)) {
      const roles = Object.keys(p.rates!);
      const card = roles.map((r) => `${r} $${p.rates![r]}`).join(", ");
      const role = rateRole(q, roles);
      if (v === null) {
        out.push({ verdict: "warn", head: "Add the rate", body: `Type the hourly rate, for example $90/hr. ${p.contract}'s card: ${card}.`, source: where(p), ruleId: p.id });
        continue;
      }
      const floor = role ? p.rates![role]! : Math.min(...roles.map((r) => p.rates![r]!));
      const top = role ? floor : Math.max(...roles.map((r) => p.rates![r]!));
      if (v < floor) {
        out.push({ verdict: "stop", head: `Triggers ${p.contract.split(" —")[0]}'s best-price promise`, body: `No other customer may get better ${p.activity.replace(/\.$/, "")}. ${role ? `The ${role} rate is $${floor}/hr` : `The lowest rate on the card is $${floor}/hr`}, so offering $${v}/hr must be credited to ${p.contract.split(" —")[0]}, backdated.`, source: where(p), ruleId: p.id });
      } else if (v < top) {
        out.push({ verdict: "warn", head: "Depends on the role", body: `$${v}/hr is below some rates on the card (${card}). Name the role to get a clear answer.`, source: where(p), ruleId: p.id });
      } else {
        out.push({ verdict: "ok", head: "Above the best-price rates", body: `$${v}/hr is at or above ${role ? `the $${floor}/hr ${role} rate` : "every rate on the card"}, so the promise isn't triggered.`, source: where(p), ruleId: p.id });
      }
    }
  }

  // 2. Places and fields against non-competes and exclusivity.
  const places = placesIn(q);
  for (const p of promises.filter((x) => x.type === "non_compete" || x.type === "partner_exclusivity")) {
    const inField = fieldMatch(p, q);
    const inPlace = places.some((pl) => p.territory.includes(pl)) || p.territory.includes("worldwide");
    if (!inField) continue;
    if (p.status === "expired") {
      out.push({ verdict: "ok", head: `${p.contract.split(" —")[0]}'s promise has ended`, body: `${p.activity} It no longer restricts AtliQ, but it shows how the client may see it.`, source: where(p), ruleId: p.id });
      continue;
    }
    const waiver = p.waiverScopes.length ? ` The only waiver on file: ${p.waiverScopes.join("; ")}.` : "";
    if (inPlace) out.push({ verdict: "stop", head: `Clashes with the ${p.contract.split(" —")[0]} promise`, body: `${p.activity}${waiver}`, source: where(p), ruleId: p.id });
    else out.push({ verdict: "warn", head: `Check where: ${p.contract.split(" —")[0]} covers ${p.territory.join(", ")}`, body: `${p.activity} Fine outside ${p.territory.join(", ")}; name the country to be sure.${waiver}`, source: where(p), ruleId: p.id });
  }

  // 3. IP and reusable tools.
  if (/\b(ip|ownership|own the|owns|source code|reuse|re-use|pipekit|accelerator|our tools?)\b/.test(s)) {
    const assigned = promises.find((p) => p.type === "ip_assigned" && p.assets.some((a) => s.includes(a.split(/[\s(]/)[0]!.toLowerCase())));
    if (assigned) out.push({ verdict: "stop", head: `${assigned.assets[0]!.split(" (")[0]} is no longer AtliQ's to offer`, body: assigned.activity, source: where(assigned), ruleId: assigned.id });
    const ip = term("ip");
    if (ip) out.push({ verdict: "warn", head: "Offer a licence, not ownership", body: ip.usual, source: "Usual terms · IP", ruleId: "baseline:ip" });
  }

  // 4. Payment days.
  const pay = s.match(/(\d{2,3})[- ]?days?\b[^.]*\b(pay|payment|invoice)|\b(pay|payment|invoice)[^.]*?(\d{2,3})[- ]?days?|\bnet[- ]?(\d{2,3})\b/);
  if (pay) {
    const n = Number(pay[1] ?? pay[4] ?? pay[5]);
    const t = term("payment_days");
    const src = `Usual terms · payment · ${t?.usual ?? "30 days"}, 45 at most`;
    if (n > 45) out.push({ verdict: "stop", head: `${n}-day payment is past AtliQ's limit`, body: "AtliQ pays its own team monthly; anything beyond 45 days needs Karandeep's approval first.", source: src, ruleId: "baseline:payment_days" });
    else if (n > 30) out.push({ verdict: "warn", head: `${n} days is above the usual 30`, body: "Accepted before (Trustline, 45 days), but only as a concession for something in return.", source: src, ruleId: "baseline:payment_days" });
    else out.push({ verdict: "ok", head: `${n}-day payment is within AtliQ's usual terms`, body: "AtliQ's usual is 30 days from invoice.", source: src, ruleId: "baseline:payment_days" });
  }

  // 5. Liability.
  if (/\b(unlimited|uncapped|no cap)\b[^.]*\bliabilit|\bliabilit\w*[^.]*\b(unlimited|uncapped|no cap)\b/.test(s)) {
    const t = term("liability_cap");
    out.push({ verdict: "stop", head: "Never unlimited liability", body: t?.hardLine ?? "AtliQ never accepts unlimited liability.", source: `Usual terms · liability · ${t?.usual ?? "capped at 1× fees"}`, ruleId: "baseline:liability_cap" });
  } else {
    const cap = s.match(/\b(\d+(?:\.\d+)?)\s*(?:x|×|times)\b[^.]*\b(fees?|liabilit)|\bliabilit\w*[^.]*?\b(\d+(?:\.\d+)?)\s*(?:x|×|times)\b/);
    if (cap) {
      const n = Number(cap[1] ?? cap[3]);
      out.push(n > 1 ? { verdict: "warn", head: `A ${n}× cap is above the usual 1×`, body: "Agree it only with a reason Karandeep accepts, and never without a cap.", source: "Usual terms · liability · capped at 1× fees", ruleId: "baseline:liability_cap" } : { verdict: "ok", head: "Within the usual liability cap", body: "AtliQ's usual is a mutual cap at 1× total fees.", source: "Usual terms · liability", ruleId: "baseline:liability_cap" });
    }
  }

  // 6. Delay penalties.
  if (/\b(penalt\w*|liquidated|delay damages|late fees?|\bld\b)/.test(s)) {
    const t = term("delay_penalty");
    const open = /\b(no cap|uncapped|unlimited|per day|a day|daily)\b/.test(s);
    out.push({
      verdict: open ? "stop" : "warn",
      head: open ? "Never an open-ended penalty" : "Offer AtliQ's usual penalty",
      body: t?.usual ?? "0.5% of the milestone fee a week, capped at 5%, client delays excluded.",
      source: `Usual terms · delay penalty${t?.hardLine ? ` · ${t.hardLine}` : ""}`,
      ruleId: "baseline:delay_penalty",
    });
  }

  // 7. Patient data and offshore work.
  if (/\b(patient|phi|hipaa|health records?|medical records?)\b/.test(s)) {
    out.push({ verdict: "warn", head: "Patient data needs a signed BAA first", body: "For a US client, no patient data moves until a HIPAA BAA is signed, and every contractor touching it needs a subcontractor BAA. The Pune team works on de-identified data only unless the BAA allows more.", source: "Deal rule R-HC-US", ruleId: "rule:R-HC-US" });
  }

  // 8. One-way NDAs and new restrictions on AtliQ.
  if (/\b(one[- ]way|unilateral)\b[^.]*\bnda\b|\bnda\b[^.]*\b(one[- ]way|unilateral)\b/.test(s)) {
    out.push({ verdict: "warn", head: "AtliQ signs mutual NDAs only", body: term("nda")?.usual ?? "Mutual only.", source: "Usual terms · NDA", ruleId: "baseline:nda" });
  }
  if (/\b(exclusiv\w*|non-?compete|not work (for|with)|won'?t work (for|with))\b/.test(s)) {
    out.push({ verdict: "warn", head: "A new restriction on AtliQ needs Karandeep", body: "Any exclusivity or non-compete AtliQ gives becomes a promise in the register and binds future deals. Agree scope, places and an end date with Karandeep first.", source: "Register · how promises are added", ruleId: "rule:new-restriction" });
  }

  if (!out.length) {
    out.push({ verdict: "ok", head: "No promise affected", body: "Nothing in the register or AtliQ's usual terms restricts this.", source: `Checked ${coverage.onFile} of ${coverage.signedInTracker} signed contracts. ${coverage.signedInTracker - coverage.onFile} aren't on file, so check anything large with Karandeep.`, ruleId: "none" });
  }
  const rank: Record<Verdict, number> = { stop: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict]);
}

/** The headline verdict for a check: the most severe answer. */
export const overall = (answers: Answer[]): Verdict => (answers.some((a) => a.verdict === "stop") ? "stop" : answers.some((a) => a.verdict === "warn") ? "warn" : "ok");
