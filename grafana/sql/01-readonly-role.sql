-- ============================================================================
-- Pulse Postgres -> Grafana read-only role
-- ============================================================================
--
-- Run as a superuser (or any role with CREATE on the database) against your
-- Pulse Postgres BEFORE pointing Grafana at it.
--
-- After this script:
--   - A role `pulse_grafana_ro` exists with SELECT on every Pulse telemetry
--     and metadata table.
--   - Future tables created by Pulse migrations inherit SELECT automatically
--     (via ALTER DEFAULT PRIVILEGES).
--   - The role explicitly does NOT have INSERT/UPDATE/DELETE/DDL anywhere.
--   - The role explicitly does NOT have access to `_pulse_kv` (internal
--     key-value store, may contain runtime config).
--
-- BEFORE FIRST USE: run an ALTER ROLE to set the password (NEVER store the
-- password in this file; use Azure Key Vault or your secrets manager):
--
--     ALTER ROLE pulse_grafana_ro WITH PASSWORD 'use-a-real-secret-here';
--
-- The script is idempotent — safe to re-run after Pulse migrations to refresh
-- grants on tables added since the last run.

-- 1. Create the role (LOGIN, no inherited superuser, password set later).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulse_grafana_ro') THEN
    CREATE ROLE pulse_grafana_ro WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_GRAFANA_CONNECTS';
  END IF;
END $$;

-- 2. Database-level: allow connect, no create.
GRANT CONNECT ON DATABASE pulse TO pulse_grafana_ro;
REVOKE CREATE ON DATABASE pulse FROM pulse_grafana_ro;

-- 3. Schema-level: allow USAGE on public, no CREATE.
GRANT USAGE ON SCHEMA public TO pulse_grafana_ro;
REVOKE CREATE ON SCHEMA public FROM pulse_grafana_ro;

-- 4. Table-level: SELECT on the Pulse-owned tables, explicit allowlist
--    (safer than `GRANT SELECT ON ALL TABLES`, which would also expose
--    things like `_pulse_kv`).
GRANT SELECT ON TABLE
  metric_points,
  log_entries,
  trace_spans,
  service_catalog,
  alert_rules,
  alert_routes,
  alert_eval_history,
  alert_silences,
  alert_notification_log,
  saved_views,
  slo_targets
TO pulse_grafana_ro;

-- 5. Sequences: needed for any `currval()` calls in queries (rare in Grafana
--    panels, but cheap to allow).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulse_grafana_ro;

-- 6. Future tables: when Pulse adds a new table in a later migration, it'll
--    inherit SELECT automatically without re-granting. Same for sequences.
--    NOTE: this assumes Pulse migrations run as a role whose default
--    privileges we control. If migrations run as a different role, run this
--    FOR ROLE <that-role> instead.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO pulse_grafana_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pulse_grafana_ro;

-- 7. Explicitly REVOKE on the internal kv table — Grafana never needs this.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_pulse_kv'
  ) THEN
    REVOKE ALL ON TABLE _pulse_kv FROM pulse_grafana_ro;
  END IF;
END $$;

-- 8. Defense-in-depth: cap statement runtime so a runaway dashboard panel
--    can't pin a connection forever. 30s matches Grafana's default.
ALTER ROLE pulse_grafana_ro SET statement_timeout = '30s';

-- 9. Verify (these queries will show what the role has):
--
--   SELECT rolname, rolcanlogin, rolconfig FROM pg_roles WHERE rolname = 'pulse_grafana_ro';
--
--   SELECT table_schema, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'pulse_grafana_ro'
--   ORDER BY table_schema, table_name, privilege_type;

COMMENT ON ROLE pulse_grafana_ro IS
  'Read-only role for Grafana to query Pulse telemetry tables. SELECT only; '
  'set password via ALTER ROLE before first Grafana connection. Statement '
  'timeout 30s. New tables inherit SELECT via ALTER DEFAULT PRIVILEGES.';
