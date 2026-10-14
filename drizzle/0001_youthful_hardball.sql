CREATE TABLE "negotiation_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"text" text NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"addressed" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pushbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negotiation_conditions" ADD CONSTRAINT "negotiation_conditions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pushbacks" ADD CONSTRAINT "pushbacks_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negotiation_conditions_contract_idx" ON "negotiation_conditions" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "pushbacks_contract_idx" ON "pushbacks" USING btree ("contract_id");