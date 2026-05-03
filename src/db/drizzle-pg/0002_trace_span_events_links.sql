ALTER TABLE "trace_spans" ADD COLUMN IF NOT EXISTS "events_json" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trace_spans" ADD COLUMN IF NOT EXISTS "links_json" text DEFAULT '[]' NOT NULL;
