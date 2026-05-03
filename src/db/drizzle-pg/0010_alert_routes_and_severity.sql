-- Migration 10: Alert severity + per-market/team routing targets.
-- Adds severity to alert_rules, plus a flexible alert_routes table for
-- fanning notifications to per-market channels (one Slack channel + one
-- PagerDuty service per market) and a platform-team channel for shared
-- services with wide-blast or high-severity breaches.

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  ALTER TABLE alert_rules
    ADD CONSTRAINT alert_rules_severity_chk
    CHECK (severity IN ('info', 'warning', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS alert_routes (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_value TEXT,
  channel_type TEXT NOT NULL,
  channel_value TEXT NOT NULL,
  severity_min TEXT NOT NULL DEFAULT 'warning',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT alert_routes_scope_chk
    CHECK (scope_type IN ('market', 'team', 'default')),
  CONSTRAINT alert_routes_channel_chk
    CHECK (channel_type IN ('slack', 'pagerduty', 'webhook', 'email')),
  CONSTRAINT alert_routes_severity_chk
    CHECK (severity_min IN ('info', 'warning', 'critical'))
);

-- Unique by (scope_type, scope_value, channel_type) so an upsert keyed on the
-- triple is idempotent. NULL scope_value (default scope) is treated as a
-- distinct value via the partial indexes below.
CREATE UNIQUE INDEX IF NOT EXISTS alert_routes_scoped_uidx
  ON alert_routes (scope_type, scope_value, channel_type)
  WHERE scope_value IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alert_routes_default_uidx
  ON alert_routes (scope_type, channel_type)
  WHERE scope_value IS NULL;

CREATE INDEX IF NOT EXISTS alert_routes_scope_lookup_idx
  ON alert_routes (scope_type, scope_value)
  WHERE enabled = TRUE;
