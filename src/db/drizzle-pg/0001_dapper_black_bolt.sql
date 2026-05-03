CREATE TABLE IF NOT EXISTS "_pulse_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_points" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "log_entries" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trace_spans" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trace_spans" DROP CONSTRAINT IF EXISTS "trace_spans_span_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trace_spans_tenant_span_uidx" ON "trace_spans" USING btree ("tenant_id","span_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_points_tenant_ts_idx" ON "metric_points" USING btree ("tenant_id","ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_points_tenant_name_service_ts_idx" ON "metric_points" USING btree ("tenant_id","name","service","ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_entries_tenant_ts_idx" ON "log_entries" USING btree ("tenant_id","ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_entries_tenant_service_ts_idx" ON "log_entries" USING btree ("tenant_id","service","ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_spans_tenant_trace_idx" ON "trace_spans" USING btree ("tenant_id","trace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_spans_tenant_start_ts_idx" ON "trace_spans" USING btree ("tenant_id","start_ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_spans_tenant_service_start_idx" ON "trace_spans" USING btree ("tenant_id","service","start_ts");
--> statement-breakpoint
ALTER TABLE "trace_spans" ADD COLUMN IF NOT EXISTS "attributes_jsonb" jsonb GENERATED ALWAYS AS (
	CASE
		WHEN ("attributes_json" IS NULL OR trim("attributes_json") = '') THEN '{}'::jsonb
		ELSE "attributes_json"::jsonb
	END
) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_spans_attrs_jsonb_gin" ON "trace_spans" USING gin ("attributes_jsonb" jsonb_path_ops);
