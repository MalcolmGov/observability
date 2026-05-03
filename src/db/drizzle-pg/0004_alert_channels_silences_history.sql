ALTER TABLE "alert_rules" ADD COLUMN IF NOT EXISTS "slack_webhook_url" text;
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN IF NOT EXISTS "pagerduty_routing_key" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_silences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"rule_id" bigint,
	"ends_at_ms" bigint NOT NULL,
	"reason" text,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_silences_tenant_ends_idx" ON "alert_silences" USING btree ("tenant_id","ends_at_ms");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_eval_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"rule_id" bigint NOT NULL,
	"evaluated_at_ms" bigint NOT NULL,
	"firing" integer DEFAULT 0 NOT NULL,
	"observed_avg" double precision,
	"silenced" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_eval_history_tenant_ts_idx" ON "alert_eval_history" USING btree ("tenant_id","evaluated_at_ms");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_notification_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"rule_id" bigint NOT NULL,
	"channel" text NOT NULL,
	"sent_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_notification_log_dedupe_idx" ON "alert_notification_log" USING btree ("tenant_id","rule_id","channel","sent_at_ms");
