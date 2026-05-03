-- Service catalog soft-delete / hide disabled rows from default lists.
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS service_catalog_enabled_idx ON service_catalog (enabled);

-- Stub upserts merge telemetry markets into markets_active; when the distinct set grows past 1,
-- scope MUST flip from market_local → shared (handled in application upsert SQL / TS).
