ALTER TABLE "deal_notes" ADD COLUMN "checks" jsonb;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD COLUMN "compared_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD COLUMN "compared_at" timestamp with time zone;