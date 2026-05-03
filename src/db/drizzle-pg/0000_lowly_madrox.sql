CREATE TABLE "alert_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"metric_name" text NOT NULL,
	"service" text NOT NULL,
	"comparator" text NOT NULL,
	"threshold" double precision NOT NULL,
	"window_minutes" integer DEFAULT 5 NOT NULL,
	"webhook_url" text,
	"runbook_url" text
);
--> statement-breakpoint
CREATE TABLE "log_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" bigint NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"service" text NOT NULL,
	"attributes_json" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" bigint NOT NULL,
	"name" text NOT NULL,
	"value" double precision NOT NULL,
	"service" text NOT NULL,
	"labels_json" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slo_targets" (
	"service" text PRIMARY KEY NOT NULL,
	"target_success" double precision NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_spans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"service" text NOT NULL,
	"name" text NOT NULL,
	"start_ts" bigint NOT NULL,
	"end_ts" bigint NOT NULL,
	"duration_ms" double precision NOT NULL,
	"kind" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"peer_service" text,
	"attributes_json" text DEFAULT '{}' NOT NULL,
	CONSTRAINT "trace_spans_span_id_unique" UNIQUE("span_id")
);
--> statement-breakpoint
CREATE INDEX "log_entries_ts_idx" ON "log_entries" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "log_entries_service_ts_idx" ON "log_entries" USING btree ("service","ts");--> statement-breakpoint
CREATE INDEX "metric_points_ts_idx" ON "metric_points" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "metric_points_name_service_ts_idx" ON "metric_points" USING btree ("name","service","ts");--> statement-breakpoint
CREATE INDEX "trace_spans_trace_id_idx" ON "trace_spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "trace_spans_start_ts_idx" ON "trace_spans" USING btree ("start_ts");--> statement-breakpoint
CREATE INDEX "trace_spans_service_start_idx" ON "trace_spans" USING btree ("service","start_ts");