// Drizzle schema, ported from the first build (24 tables). Later phases add their own tables in their own
// migrations. Live/expired/permanent status is never stored as truth: lib/checks/dates.ts computes it from
// APP_TODAY. The `seeded_status` column keeps the seeded value for reference only.
import {
  boolean,
  uniqueIndex,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ---------- Reference data (seed/*.json) ----------

export const entities = pgTable("entities", {
  id: text("id").primaryKey(), // PVT | INC
  legalName: text("legal_name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  country: text("country").notNull(),
  serves: text("serves").notNull(),
  defaultLaw: text("default_law").notNull(),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
});

/** The free-text entity/law rules from seed/entities.json, shown verbatim; enforced in lib/checks/entityLaw.ts. */
export const entityRules = pgTable("entity_rules", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
});

export const commitments = pgTable("commitments", {
  id: text("id").primaryKey(), // CMT-001…
  type: text("type").notNull(), // non_compete | best_price | partner_exclusivity | ip_assigned
  contract: text("contract").notNull(),
  contractId: uuid("contract_id"), // the signed contract it came from, when on file
  signed: date("signed").notNull(),
  entity: text("entity").notNull(),
  clauses: jsonb("clauses").$type<string[]>().notNull().default([]),
  bindsAffiliates: boolean("binds_affiliates").notNull(),
  activity: text("activity").notNull(),
  forWhom: text("for_whom").notNull(),
  territory: jsonb("territory").$type<string[]>().notNull().default([]),
  territoryRule: text("territory_rule"),
  domain: text("domain").notNull(),
  starts: date("starts").notNull(),
  ends: date("ends"),
  endRule: text("end_rule"),
  seededStatus: text("seeded_status"),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  quote: text("quote").notNull(),
  /** reference_rates_usd_per_hour, consequence, carve_outs, assets_affected, ocr_quality … */
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
});

export const waivers = pgTable("waivers", {
  id: text("id").primaryKey(),
  commitmentId: text("commitment_id")
    .notNull()
    .references(() => commitments.id),
  source: text("source").notNull(),
  dated: date("dated").notNull(),
  scope: text("scope").notNull(),
  excludes: text("excludes").notNull(),
  quote: text("quote").notNull(),
});

export const clients = pgTable("clients", {
  name: text("name").primaryKey(),
  entity: text("entity").notNull(),
  country: text("country").notNull(),
  domain: text("domain").notNull(),
  ends: date("ends"),
  status: text("status").notNull(), // live | ended
});

export const baselineTerms = pgTable("baseline_terms", {
  term: text("term").primaryKey(),
  usual: text("usual").notNull(),
  count: text("count"),
  source: text("source"),
  exceptions: jsonb("exceptions").$type<string[]>().notNull().default([]),
  hardLine: text("hard_line"),
  /** max, severity_if_unlimited … */
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  counterparty: text("counterparty").notNull(),
  date: text("date").notNull(), // YYYY-MM
  term: text("term").notNull(),
  outcome: text("outcome").notNull(),
  label: text("label").notNull(), // standard | deliberate_exception | waved_through | unclear
  quote: text("quote").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
});

export const dealRules = pgTable("deal_rules", {
  id: text("id").primaryKey(),
  rule: jsonb("rule").$type<{ when: string; requires: string[]; also?: string }>().notNull(),
});

// ---------- Contracts and deals ----------

/** A client or counterparty company. Every contract belongs to one: its deal's client, or its own counterparty. */
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Normalised name used to merge spellings ("Harrington Health Systems, Inc." = "Harrington Health Systems Inc"). */
  key: text("key").notNull().unique(),
  country: text("country"),
  createdAt: createdAt(),
});

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyId: uuid("company_id"),
  owner: text("owner").notNull(),
  valueUsd: numeric("value_usd", { mode: "number" }),
  currency: text("currency").notNull().default("USD"),
  domain: text("domain").notNull(),
  clientCountry: text("client_country").notNull(),
  deliveredFrom: text("delivered_from").notNull().default("Pune, India"),
  dataTouchers: jsonb("data_touchers").$type<string[]>().notNull().default([]),
  clientDeadline: date("client_deadline"),
  deadlineNote: text("deadline_note"),
  flow: text("flow").notNull().default("new"), // new | upsell
  parentContract: text("parent_contract"),
  personalData: boolean("personal_data"),
  phi: boolean("phi"),
  createdAt: createdAt(),
  /** Set when deal details are edited; reviews finished before this used the old details. */
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").references(() => deals.id),
    companyId: uuid("company_id"),
    trackerId: text("tracker_id"), // C-0xx from contract_tracker.csv
    title: text("title").notNull(),
    counterparty: text("counterparty").notNull(),
    owner: text("owner"), // requested_by in the tracker
    docType: text("doc_type").notNull(), // msa|sow|nda|baa|dpa|partnership|subcontract|freelancer|waiver|other
    direction: text("direction").notNull().default("atliq_supplier"), // atliq_supplier | atliq_buyer
    status: text("status").notNull().default("received"), // received|in_review|reviewed|negotiating|signed|rejected
    decision: text("decision"), // sign_intended | reject (manual, Karandeep only)
    decisionNote: text("decision_note"),
    isSigned: boolean("is_signed").notNull().default(false),
    signedDate: date("signed_date"),
    ends: date("ends"),
    sourceFile: text("source_file"),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
    clauseCount: integer("clause_count").notNull().default(0),
    scheduleItemCount: integer("schedule_item_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id"),
    createdAt: createdAt(),
  },
  (t) => [index("contracts_text_hash_idx").on(t.textHash), index("contracts_deal_idx").on(t.dealId)],
);

export const dealDocuments = pgTable(
  "deal_documents",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    role: text("role").notNull(), // client_contract|baa|dpa|nda|subcontract|freelancer|sow|parent_msa|call_note
  },
  (t) => [primaryKey({ columns: [t.dealId, t.contractId] })],
);

export const contractLinks = pgTable(
  "contract_links",
  {
    fromId: uuid("from_id")
      .notNull()
      .references(() => contracts.id),
    toId: uuid("to_id")
      .notNull()
      .references(() => contracts.id),
    kind: text("kind").notNull(), // exhibit_of | subcontract_for | sow_under | version_of
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId, t.kind] })],
);

/** Approved call notes attached to a deal (UC-07 / TC44). */
export const dealNotes = pgTable("deal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id),
  title: text("title").notNull(),
  text: text("text").notNull(),
  approvedBy: text("approved_by"),
  createdAt: createdAt(),
});

// ---------- Reviews ----------

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    version: integer("version").notNull().default(1),
    kind: text("kind").notNull().default("incoming"), // incoming | portfolio
    status: text("status").notNull().default("running"), // running | done | failed
    step: text("step"),
    score: integer("score"),
    band: text("band"),
    summary: jsonb("summary").$type<{ text: string; findingIds: string[] }[]>(),
    clausesRead: integer("clauses_read"),
    clausesFound: integer("clauses_found"),
    coverageLine: text("coverage_line"),
    textMasked: text("text_masked"),
    /** Intermediate step outputs (extract, checks, clash, scan, bundle) so each step route is idempotent. */
    artifacts: jsonb("artifacts").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    /** Background runs: the server holds this lease while it runs a step, so two runners never run one review. */
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    /** When the last step finished (shows progress and detects a stalled background run). */
    progressAt: timestamp("progress_at", { withTimezone: true }),
  },
  (t) => [index("reviews_contract_idx").on(t.contractId)],
);

export type FindingRelated = {
  commitmentId?: string;
  contract?: string;
  clause?: string;
  quote?: string;
  ends?: string | null;
  status?: string;
  waiver?: string;
  docB?: string;
  clauseB?: string | null;
  quoteB?: string | null;
  basis?: string;
  citedClause?: string | null;
  highlight?: { start: number; end: number } | null;
  notSureReason?: string | null;
  key?: string;
  [k: string]: unknown;
};

export type FindingComment = { by: string; at: string; text: string };

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id),
    check: text("check").notNull(),
    // clash|history|baseline|deal_value|entity_law|missing_protection|bundle_missing|bundle_conflict|
    // pass_down|delivery|full_read|fairness|note_gap|injection|scope
    category: text("category"),
    severity: text("severity").notNull(), // serious|negotiable|minor|not_sure|info
    title: text("title").notNull(),
    clause: text("clause"),
    quote: text("quote"),
    quoteVerified: boolean("quote_verified").notNull().default(false),
    absent: boolean("absent").notNull().default(false),
    related: jsonb("related").$type<FindingRelated>(),
    whatItMeans: text("what_it_means"),
    whatItCouldCost: text("what_it_could_cost"),
    howToSoften: text("how_to_soften"),
    pastPositions: jsonb("past_positions").$type<number[]>().notNull().default([]),
    source: text("source").notNull().default("code"), // code | ai
    versionTag: text("version_tag"), // new | resolved | unchanged
    dismissed: boolean("dismissed").notNull().default(false),
    dismissedBy: text("dismissed_by"),
    dismissReason: text("dismiss_reason"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    accepted: boolean("accepted").notNull().default(false), // Serious item explicitly accepted with a note
    acceptNote: text("accept_note"),
    comments: jsonb("comments").$type<FindingComment[]>().notNull().default([]),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("findings_review_idx").on(t.reviewId)],
);

// ---------- Workflow ----------

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  reviewer: text("reviewer").notNull(),
  assignedBy: text("assigned_by").notNull(),
  reviewDeadline: date("review_deadline").notNull(),
  concerns: text("concerns"),
  status: text("status").notNull().default("assigned"), // assigned | done
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** Minutes the reviewer spent on the marking screen (a heartbeat while it is open and in front). */
  minutesSpent: integer("minutes_spent").notNull().default(0),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipient: text("recipient").notNull(),
    kind: text("kind").notNull(), // assigned | review_done | deadline_soon | overdue | new_version | comment
    contractId: uuid("contract_id").references(() => contracts.id),
    reviewId: uuid("review_id"),
    text: text("text").notNull(),
    read: boolean("read").notNull().default(false),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipient)],
);

// ---------- Privacy and audit ----------

/** Never sent to the AI, never logged. */
export const maskingKeys = pgTable(
  "masking_keys",
  {
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id),
    token: text("token").notNull(),
    original: text("original").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.token] })],
);

export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id"),
  step: text("step").notNull(),
  maskedPromptHash: text("masked_prompt_hash").notNull(),
  provider: text("provider").notNull().default("anthropic"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  ms: integer("ms").notNull().default(0),
  attempt: integer("attempt").notNull().default(1),
  ok: boolean("ok").notNull(),
  error: text("error"),
  createdAt: createdAt(),
});

/** Key/value settings, e.g. the register coverage constant. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Audit log: who did what and when (dismiss, accept, decide, assign, comment, confirm, edit, review started…). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    contractId: uuid("contract_id"),
    findingId: uuid("finding_id"),
    dealId: uuid("deal_id"),
    commitmentId: text("commitment_id"),
    /** Plain sentence shown in the log, e.g. "Dismissed “Uncapped delay penalty”: client agreed to cap". */
    text: text("text").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("audit_events_at_idx").on(t.at), index("audit_events_contract_idx").on(t.contractId)],
);

/** People who can sign in. `name` is the identity shown everywhere (actor, owner, reviewer, recipient). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // stored lower-case
  name: text("name").notNull().unique(),
  role: text("role").notNull().default("reviewer"), // admin | reviewer | viewer
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Signed-in sessions. Only a hash of the cookie token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- Negotiation (P6) ----------

/**
 * Karandeep's conditions when he rejects a version as written but stays open to negotiate ("written waiver from Al
 * Noor before signing"). They join the pushback list; the next version's reviewer marks each addressed or not.
 * Open conditions are carried to the next version of the contract.
 */
export const negotiationConditions = pgTable(
  "negotiation_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    /** The contract version the condition was set on. */
    round: integer("round").notNull(),
    text: text("text").notNull(),
    open: boolean("open").notNull().default(true),
    /** Set in a re-review: yes | no. */
    addressed: text("addressed"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("negotiation_conditions_contract_idx").on(t.contractId)],
);

/** A pushback sent to the counterparty (by the user, from their own email; the app never sends). */
export const pushbacks = pgTable(
  "pushbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    round: integer("round").notNull(),
    items: jsonb("items").$type<string[]>().notNull().default([]),
    sentBy: text("sent_by").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("pushbacks_contract_idx").on(t.contractId)],
);

// ---------- Deals (P9) ----------

/** A "Can I offer this?" check someone recorded, so the same question isn't asked or remembered twice. */
export const offerChecks = pgTable(
  "offer_checks",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(),
    query: text("query").notNull(),
    verdict: text("verdict").notNull(), // stop | warn | ok
    head: text("head").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("offer_checks_actor_idx").on(t.actor)],
);

// ---------- Review hand-off (P10) ----------

/** A reviewer's view of one finding: agree (push back on it), disagree, or a question for Karandeep. */
export const findingMarks = pgTable(
  "finding_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id),
    reviewer: text("reviewer").notNull(),
    mark: text("mark").notNull(), // agree | disagree | question
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("finding_marks_finding_reviewer_idx").on(t.findingId, t.reviewer), index("finding_marks_contract_idx").on(t.contractId)],
);

/** A second reviewer on the CEO's own High-risk deal: a prompt, not a lock. `declined` records "Not this time". */
export const secondReviews = pgTable(
  "second_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    reviewer: text("reviewer"),
    assignedBy: text("assigned_by").notNull(),
    reviewDeadline: date("review_deadline"),
    status: text("status").notNull().default("assigned"), // assigned | done | declined
    minutesSpent: integer("minutes_spent").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("second_reviews_contract_idx").on(t.contractId)],
);

/** A question to outside counsel, sent as part of a counsel pack. The app shares it in-app only; nothing is emailed. */
export const counselQuestions = pgTable(
  "counsel_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: uuid("pack_id").notNull(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    question: text("question").notNull(),
    files: jsonb("files").$type<string[]>().notNull().default([]),
    askedBy: text("asked_by").notNull(),
    answerBy: date("answer_by"),
    answer: text("answer"),
    answeredBy: text("answered_by"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    nudgedAt: timestamp("nudged_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("counsel_questions_contract_idx").on(t.contractId)],
);
