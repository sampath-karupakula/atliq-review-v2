ALTER TABLE "contracts" ADD COLUMN "decision_requested_by" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "decision_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "decision_request_note" text;