-- Migration 6: Service catalog registry + telemetry identity columns + alert/SLO scope.
-- Separates human-curated service_catalog from high-volume telemetry tables.

CREATE TABLE IF NOT EXISTS service_catalog (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  product TEXT NOT NULL,
  scope TEXT NOT NULL,
  markets_active TEXT[] NOT NULL DEFAULT '{}',
  tier INTEGER NOT NULL DEFAULT 3,
  owner_team TEXT,
  oncall_slack TEXT,
  oncall_pd_key TEXT,
  repo_url TEXT,
  runbook_url TEXT,
  tags JSONB DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT service_catalog_scope_chk CHECK (scope IN ('shared', 'market_local')),
  CONSTRAINT service_catalog_product_chk CHECK (product IN ('consumer', 'merchant', 'agent', 'platform'))
);

CREATE INDEX IF NOT EXISTS service_catalog_product_idx ON service_catalog (product);
CREATE INDEX IF NOT EXISTS service_catalog_scope_idx ON service_catalog (scope);

INSERT INTO service_catalog (
  service_name, display_name, product, scope, markets_active, tier, owner_team,
  created_at, updated_at
)
VALUES
  ('notifications-api', 'Notifications API', 'platform', 'shared', ARRAY['ZA','NG','KE','GH','EG']::text[], 2, 'platform-team',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('fraud-ml-api', 'Fraud ML API', 'platform', 'shared', ARRAY['ZA','NG','KE','GH','EG']::text[], 2, 'risk-team',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('consumer-auth-api', 'Consumer Auth API', 'consumer', 'shared', ARRAY['ZA','NG','KE','GH','EG']::text[], 2, 'consumer-team',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('ledger-ke', 'Ledger (Kenya)', 'platform', 'market_local', ARRAY['KE']::text[], 1, 'kenya-platform',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('settlement-ng', 'Settlement (Nigeria)', 'platform', 'market_local', ARRAY['NG']::text[], 1, 'nigeria-platform',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('kyc-za', 'KYC (South Africa)', 'platform', 'market_local', ARRAY['ZA']::text[], 2, 'sa-compliance',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('consumer-payments-api', 'Consumer Payments API', 'consumer', 'shared', ARRAY['ZA','NG','KE','GH','EG']::text[], 1, 'consumer-team',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint),
  ('merchant-onboarding-zw', 'Merchant Onboarding (Zimbabwe)', 'merchant', 'market_local', ARRAY['ZW']::text[], 3, 'zimbabwe-merchant',
   (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint, (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint)
ON CONFLICT (service_name) DO NOTHING;

ALTER TABLE trace_spans DROP COLUMN IF EXISTS release_train;
ALTER TABLE log_entries DROP COLUMN IF EXISTS release_train;
ALTER TABLE metric_points DROP COLUMN IF EXISTS release_train;

ALTER TABLE trace_spans ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE metric_points ADD COLUMN IF NOT EXISTS instance_id TEXT;

UPDATE trace_spans SET product = 'unknown' WHERE product IS NULL OR TRIM(product) = '';
UPDATE trace_spans SET market = 'unknown' WHERE market IS NULL OR TRIM(market) = '';
UPDATE trace_spans SET environment = 'unknown' WHERE environment IS NULL OR TRIM(environment) = '';
UPDATE trace_spans SET version = NULL WHERE version IS NOT NULL AND TRIM(version) = '';

UPDATE log_entries SET product = 'unknown' WHERE product IS NULL OR TRIM(product) = '';
UPDATE log_entries SET market = 'unknown' WHERE market IS NULL OR TRIM(market) = '';
UPDATE log_entries SET environment = 'unknown' WHERE environment IS NULL OR TRIM(environment) = '';
UPDATE log_entries SET version = NULL WHERE version IS NOT NULL AND TRIM(version) = '';

UPDATE metric_points SET product = 'unknown' WHERE product IS NULL OR TRIM(product) = '';
UPDATE metric_points SET market = 'unknown' WHERE market IS NULL OR TRIM(market) = '';
UPDATE metric_points SET environment = 'unknown' WHERE environment IS NULL OR TRIM(environment) = '';
UPDATE metric_points SET version = NULL WHERE version IS NOT NULL AND TRIM(version) = '';

ALTER TABLE trace_spans ALTER COLUMN product SET DEFAULT 'unknown';
ALTER TABLE trace_spans ALTER COLUMN market SET DEFAULT 'unknown';
ALTER TABLE trace_spans ALTER COLUMN environment SET DEFAULT 'unknown';
ALTER TABLE trace_spans ALTER COLUMN version DROP NOT NULL;
ALTER TABLE trace_spans ALTER COLUMN version DROP DEFAULT;

ALTER TABLE log_entries ALTER COLUMN product SET DEFAULT 'unknown';
ALTER TABLE log_entries ALTER COLUMN market SET DEFAULT 'unknown';
ALTER TABLE log_entries ALTER COLUMN environment SET DEFAULT 'unknown';
ALTER TABLE log_entries ALTER COLUMN version DROP NOT NULL;
ALTER TABLE log_entries ALTER COLUMN version DROP DEFAULT;

ALTER TABLE metric_points ALTER COLUMN product SET DEFAULT 'unknown';
ALTER TABLE metric_points ALTER COLUMN market SET DEFAULT 'unknown';
ALTER TABLE metric_points ALTER COLUMN environment SET DEFAULT 'unknown';
ALTER TABLE metric_points ALTER COLUMN version DROP NOT NULL;
ALTER TABLE metric_points ALTER COLUMN version DROP DEFAULT;

CREATE INDEX IF NOT EXISTS metric_points_market_product_service_ts_idx
  ON metric_points (market, product, service, ts DESC);

CREATE INDEX IF NOT EXISTS log_entries_market_product_service_ts_idx
  ON log_entries (market, product, service, ts DESC);

CREATE INDEX IF NOT EXISTS trace_spans_market_product_service_ts_idx
  ON trace_spans (market, product, service, start_ts DESC);

CREATE INDEX IF NOT EXISTS trace_spans_market_env_ts_idx
  ON trace_spans (market, environment, start_ts DESC)
  WHERE environment = 'prod';

ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS market_scope TEXT;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod';

ALTER TABLE slo_targets ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE slo_targets ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE slo_targets ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'prod';

ALTER TABLE slo_targets DROP CONSTRAINT slo_targets_pkey;
ALTER TABLE slo_targets ADD PRIMARY KEY (service, product, market, environment);
