// Load reference data from seed/*.json (eval, no DB) — the same files scripts/seed.ts loads into Postgres.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Reference } from "./types";

type Raw = Record<string, unknown>;

export function referenceFromSeed(root = process.cwd()): Reference {
  const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(root, "seed", f), "utf8")) as T;
  const ent = read<{ entities: Raw[] }>("entities.json");
  const reg = read<{ commitments: Raw[]; waivers: Raw[] }>("register.json");
  const clients = read<{ clients: Raw[] }>("clients.json");
  const baseline = read<{ terms: Raw[] }>("baseline.json");
  const positions = read<{ positions: Raw[] }>("positions.json");
  const rules = read<{ rules: Raw[] }>("deal_rules.json");

  return {
    entities: ent.entities.map((e) => ({
      id: e.id as "PVT" | "INC",
      legalName: e.legal_name as string,
      aliases: e.aliases as string[],
      country: e.country as string,
      defaultLaw: e.default_law as string,
    })),
    commitments: reg.commitments.map((c) => {
      const {
        id, type, contract, signed, entity, clauses, binds_affiliates, activity, for_whom, territory, territory_rule,
        domain, starts, ends, end_rule, confirmed, quote, waivers: _w, status: _s, ...extra
      } = c as Record<string, never>;
      void _w;
      void _s;
      return {
        id, type, contract, signed, entity, clauses, bindsAffiliates: binds_affiliates, activity, forWhom: for_whom,
        territory, territoryRule: territory_rule ?? null, domain, starts, ends: ends ?? null, endRule: end_rule ?? null,
        confirmed, quote, extra,
      };
    }),
    waivers: reg.waivers.map((w) => ({
      id: w.id as string,
      commitmentId: w.commitment as string,
      source: w.source as string,
      dated: w.dated as string,
      scope: w.scope as string,
      excludes: w.excludes as string,
      quote: w.quote as string,
    })),
    clients: clients.clients as Reference["clients"],
    baseline: baseline.terms.map((t) => {
      const { term, usual, count, source, exceptions, hard_line, ...extra } = t as Record<string, never>;
      return { term, usual, count: count ?? null, source: source ?? null, exceptions: exceptions ?? [], hardLine: hard_line ?? null, extra };
    }),
    positions: positions.positions.map((p, i) => ({ id: i + 1, ...(p as Omit<Reference["positions"][number], "id">) })),
    dealRules: rules.rules as Reference["dealRules"],
    coverage: { onFile: 17, signedInTracker: 30 },
  };
}

/** Organisation names to mask in every review: register contracts and current/past clients. */
export function referenceOrgNames(ref: Reference): string[] {
  return [...new Set([...ref.clients.map((c) => c.name), ...ref.commitments.map((c) => c.contract.split(/\s+[—–]\s+/)[0])])];
}
