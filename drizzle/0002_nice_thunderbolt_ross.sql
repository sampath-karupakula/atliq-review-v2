CREATE TABLE "offer_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"query" text NOT NULL,
	"verdict" text NOT NULL,
	"head" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "offer_checks_actor_idx" ON "offer_checks" USING btree ("actor");