CREATE TABLE "counsel_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"question" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asked_by" text NOT NULL,
	"answer_by" date,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"nudged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"mark" text NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "second_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"reviewer" text,
	"assigned_by" text NOT NULL,
	"review_deadline" date,
	"status" text DEFAULT 'assigned' NOT NULL,
	"minutes_spent" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "minutes_spent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "counsel_questions" ADD CONSTRAINT "counsel_questions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_marks" ADD CONSTRAINT "finding_marks_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_marks" ADD CONSTRAINT "finding_marks_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "second_reviews" ADD CONSTRAINT "second_reviews_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counsel_questions_contract_idx" ON "counsel_questions" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_marks_finding_reviewer_idx" ON "finding_marks" USING btree ("finding_id","reviewer");--> statement-breakpoint
CREATE INDEX "finding_marks_contract_idx" ON "finding_marks" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "second_reviews_contract_idx" ON "second_reviews" USING btree ("contract_id");