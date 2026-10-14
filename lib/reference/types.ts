// Reference data every review is checked against (seed/*.json, or the same tables in Postgres).

export type EntityRef = {
  id: "PVT" | "INC";
  legalName: string;
  aliases: string[];
  country: string;
  defaultLaw: string;
};

export type CommitmentRef = {
  id: string;
  type: string;
  contract: string;
  signed: string;
  entity: string;
  clauses: string[];
  bindsAffiliates: boolean;
  activity: string;
  forWhom: string;
  territory: string[];
  territoryRule: string | null;
  domain: string;
  starts: string;
  ends: string | null;
  endRule: string | null;
  confirmed: boolean;
  quote: string;
  extra: Record<string, unknown>;
};

export type WaiverRef = { id: string; commitmentId: string; source: string; dated: string; scope: string; excludes: string; quote: string };
export type ClientRef = { name: string; entity: string; country: string; domain: string; ends: string | null; status: string };
export type BaselineRef = {
  term: string;
  usual: string;
  count: string | null;
  source: string | null;
  exceptions: string[];
  hardLine: string | null;
  extra: Record<string, unknown>;
};
export type PositionRef = { id: number; counterparty: string; date: string; term: string; outcome: string; label: string; quote: string };
export type DealRuleRef = { id: string; when: string; requires: string[]; also?: string };

export type Reference = {
  entities: EntityRef[];
  commitments: CommitmentRef[];
  waivers: WaiverRef[];
  clients: ClientRef[];
  baseline: BaselineRef[];
  positions: PositionRef[];
  dealRules: DealRuleRef[];
  coverage: { onFile: number; signedInTracker: number };
};

/** Deal details from the upload form (or the test case). */
export type DealContext = {
  counterparty: string | null;
  valueUsd: number | null;
  currency: string;
  domain: string;
  clientCountry: string;
  deliveredFrom: string;
  dataTouchers: string[];
  direction: "atliq_supplier" | "atliq_buyer";
  personalData: boolean | null;
  phi: boolean | null;
};
