-- Hybrid deployment model: shared + per-market services co-exist.
-- Catalog grain: (tenant_id, product, market, environment); drill-down: service + version.
-- Collector should set resource attributes: pulse.product, pulse.market, deployment.environment,
-- service.version, pulse.release_train (optional).

ALTER TABLE "trace_spans"
  ADD COLUMN IF NOT EXISTS "product" text NOT NULL DEFAULT '';

ALTER TABLE "trace_spans"
  ADD COLUMN IF NOT EXISTS "market" text NOT NULL DEFAULT '';

ALTER TABLE "trace_spans"
  ADD COLUMN IF NOT EXISTS "environment" text NOT NULL DEFAULT 'prod';

ALTER TABLE "trace_spans"
  ADD COLUMN IF NOT EXISTS "version" text NOT NULL DEFAULT '';

ALTER TABLE "trace_spans"
  ADD COLUMN IF NOT EXISTS "release_train" text NOT NULL DEFAULT '';

COMMENT ON COLUMN trace_spans.product IS 'Product line: consumer | merchant | agent (pulse.product or deployment.product)';
COMMENT ON COLUMN trace_spans.market IS 'Market code e.g. ZA, NG (pulse.market or deployment.market)';
COMMENT ON COLUMN trace_spans.environment IS 'deployment.environment semconv; default prod';
COMMENT ON COLUMN trace_spans.version IS 'Deployable artifact version e.g. consumer-2.4.1 (service.version)';
COMMENT ON COLUMN trace_spans.release_train IS 'Rollout / train id e.g. 2026-Q2-rollout';

CREATE INDEX IF NOT EXISTS trace_spans_tenant_product_market_env_start_idx
  ON trace_spans (tenant_id, product, market, environment, start_ts);

CREATE INDEX IF NOT EXISTS trace_spans_tenant_product_market_version_start_idx
  ON trace_spans (tenant_id, product, market, version, start_ts);

CREATE INDEX IF NOT EXISTS trace_spans_tenant_service_market_start_idx
  ON trace_spans (tenant_id, service, market, start_ts);


ALTER TABLE "log_entries"
  ADD COLUMN IF NOT EXISTS "product" text NOT NULL DEFAULT '';

ALTER TABLE "log_entries"
  ADD COLUMN IF NOT EXISTS "market" text NOT NULL DEFAULT '';

ALTER TABLE "log_entries"
  ADD COLUMN IF NOT EXISTS "environment" text NOT NULL DEFAULT 'prod';

ALTER TABLE "log_entries"
  ADD COLUMN IF NOT EXISTS "version" text NOT NULL DEFAULT '';

ALTER TABLE "log_entries"
  ADD COLUMN IF NOT EXISTS "release_train" text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS log_entries_tenant_product_market_env_ts_idx
  ON log_entries (tenant_id, product, market, environment, ts);

CREATE INDEX IF NOT EXISTS log_entries_tenant_service_market_ts_idx
  ON log_entries (tenant_id, service, market, ts);


ALTER TABLE "metric_points"
  ADD COLUMN IF NOT EXISTS "product" text NOT NULL DEFAULT '';

ALTER TABLE "metric_points"
  ADD COLUMN IF NOT EXISTS "market" text NOT NULL DEFAULT '';

ALTER TABLE "metric_points"
  ADD COLUMN IF NOT EXISTS "environment" text NOT NULL DEFAULT 'prod';

ALTER TABLE "metric_points"
  ADD COLUMN IF NOT EXISTS "version" text NOT NULL DEFAULT '';

ALTER TABLE "metric_points"
  ADD COLUMN IF NOT EXISTS "release_train" text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS metric_points_tenant_product_market_env_ts_idx
  ON metric_points (tenant_id, product, market, environment, ts);

CREATE INDEX IF NOT EXISTS metric_points_tenant_name_product_market_ts_idx
  ON metric_points (tenant_id, name, product, market, ts);

-- TimescaleDB (optional): after retention policy review, consider:
--   SELECT create_hypertable('trace_spans','start_ts', migrate_data => true);
-- Not executed here — validate chunk interval & compression on a fork first.
