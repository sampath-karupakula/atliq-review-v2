CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid,
	"step" text NOT NULL,
	"masked_prompt_hash" text NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"assigned_by" text NOT NULL,
	"review_deadline" date NOT NULL,
	"concerns" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"contract_id" uuid,
	"finding_id" uuid,
	"deal_id" uuid,
	"commitment_id" text,
	"text" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baseline_terms" (
	"term" text PRIMARY KEY NOT NULL,
	"usual" text NOT NULL,
	"count" text,
	"source" text,
	"exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_line" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"name" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"country" text NOT NULL,
	"domain" text NOT NULL,
	"ends" date,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"contract" text NOT NULL,
	"contract_id" uuid,
	"signed" date NOT NULL,
	"entity" text NOT NULL,
	"clauses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"binds_affiliates" boolean NOT NULL,
	"activity" text NOT NULL,
	"for_whom" text NOT NULL,
	"territory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"territory_rule" text,
	"domain" text NOT NULL,
	"starts" date NOT NULL,
	"ends" date,
	"end_rule" text,
	"seeded_status" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"quote" text NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "contract_links" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "contract_links_from_id_to_id_kind_pk" PRIMARY KEY("from_id","to_id","kind")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"company_id" uuid,
	"tracker_id" text,
	"title" text NOT NULL,
	"counterparty" text NOT NULL,
	"owner" text,
	"doc_type" text NOT NULL,
	"direction" text DEFAULT 'atliq_supplier' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"decision" text,
	"decision_note" text,
	"is_signed" boolean DEFAULT false NOT NULL,
	"signed_date" date,
	"ends" date,
	"source_file" text,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"clause_count" integer DEFAULT 0 NOT NULL,
	"schedule_item_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_documents" (
	"deal_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "deal_documents_deal_id_contract_id_pk" PRIMARY KEY("deal_id","contract_id")
);
--> statement-breakpoint
CREATE TABLE "deal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"rule" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_id" uuid,
	"owner" text NOT NULL,
	"value_usd" numeric,
	"currency" text DEFAULT 'USD' NOT NULL,
	"domain" text NOT NULL,
	"client_country" text NOT NULL,
	"delivered_from" text DEFAULT 'Pune, India' NOT NULL,
	"data_touchers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_deadline" date,
	"deadline_note" text,
	"flow" text DEFAULT 'new' NOT NULL,
	"parent_contract" text,
	"personal_data" boolean,
	"phi" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"country" text NOT NULL,
	"serves" text NOT NULL,
	"default_law" text NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"check" text NOT NULL,
	"category" text,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"clause" text,
	"quote" text,
	"quote_verified" boolean DEFAULT false NOT NULL,
	"absent" boolean DEFAULT false NOT NULL,
	"related" jsonb,
	"what_it_means" text,
	"what_it_could_cost" text,
	"how_to_soften" text,
	"past_positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'code' NOT NULL,
	"version_tag" text,
	"dismissed" boolean DEFAULT false NOT NULL,
	"dismissed_by" text,
	"dismiss_reason" text,
	"dismissed_at" timestamp with time zone,
	"accepted" boolean DEFAULT false NOT NULL,
	"accept_note" text,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "masking_keys" (
	"review_id" uuid NOT NULL,
	"token" text NOT NULL,
	"original" text NOT NULL,
	CONSTRAINT "masking_keys_review_id_token_pk" PRIMARY KEY("review_id","token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"contract_id" uuid,
	"review_id" uuid,
	"text" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"counterparty" text NOT NULL,
	"date" text NOT NULL,
	"term" text NOT NULL,
	"outcome" text NOT NULL,
	"label" text NOT NULL,
	"quote" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'incoming' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"step" text,
	"score" integer,
	"band" text,
	"summary" jsonb,
	"clauses_read" integer,
	"clauses_found" integer,
	"coverage_line" text,
	"text_masked" text,
	"artifacts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"lease_until" timestamp with time zone,
	"progress_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'reviewer' NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" text PRIMARY KEY NOT NULL,
	"commitment_id" text NOT NULL,
	"source" text NOT NULL,
	"dated" date NOT NULL,
	"scope" text NOT NULL,
	"excludes" text NOT NULL,
	"quote" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_from_id_contracts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_to_id_contracts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "masking_keys" ADD CONSTRAINT "masking_keys_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_events_contract_idx" ON "audit_events" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contracts_text_hash_idx" ON "contracts" USING btree ("text_hash");--> statement-breakpoint
CREATE INDEX "contracts_deal_idx" ON "contracts" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "reviews_contract_idx" ON "reviews" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");