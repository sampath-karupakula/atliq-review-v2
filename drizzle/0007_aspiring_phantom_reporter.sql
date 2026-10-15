CREATE TABLE "template_fixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid,
	"contract_title" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"clause" text,
	"quote" text,
	"fair_version" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"done_by" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "template_fixes_contract_idx" ON "template_fixes" USING btree ("contract_id");