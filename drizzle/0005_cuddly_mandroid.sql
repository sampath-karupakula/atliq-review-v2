ALTER TABLE "contracts" ADD COLUMN "deletion_requested_by" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "deletion_reason" text;