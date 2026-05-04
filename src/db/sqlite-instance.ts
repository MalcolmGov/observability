import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import { isPostgres } from "@/lib/sql-dialect";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "observability.db");

function migrateTelemetryTenant(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS _pulse_kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);

  for (const tbl of ["metric_points", "log_entries", "trace_spans"] as const) {
    try {
      sqlite.exec(
        `ALTER TABLE ${tbl} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`,
      );
    } catch {
      /* column exists */
    }
  }

  sqlite.exec(`
CREATE INDEX IF NOT EXISTS metric_points_tenant_ts_idx ON metric_points(tenant_id, ts);
CREATE INDEX IF NOT EXISTS metric_points_tenant_name_service_ts_idx ON metric_points(tenant_id, name, service, ts);
CREATE INDEX IF NOT EXISTS log_entries_tenant_ts_idx ON log_entries(tenant_id, ts);
CREATE INDEX IF NOT EXISTS log_entries_tenant_service_ts_idx ON log_entries(tenant_id, service, ts);
CREATE INDEX IF NOT EXISTS trace_spans_tenant_trace_idx ON trace_spans(tenant_id, trace_id);
CREATE INDEX IF NOT EXISTS trace_spans_tenant_start_ts_idx ON trace_spans(tenant_id, start_ts);
CREATE INDEX IF NOT EXISTS trace_spans_tenant_service_start_idx ON trace_spans(tenant_id, service, start_ts);
`);

  try {
    sqlite.exec(
      `ALTER TABLE trace_spans ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]'`,
    );
  } catch {
    /* exists */
  }
  try {
    sqlite.exec(
      `ALTER TABLE trace_spans ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]'`,
    );
  } catch {
    /* exists */
  }

  const identityCols: [string, string][] = [
    ["product", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["market", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["environment", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["version", "TEXT NOT NULL DEFAULT ''"],
    ["instance_id", "TEXT"],
  ];
  for (const tbl of ["metric_points", "log_entries", "trace_spans"] as const) {
    for (const [col, def] of identityCols) {
      try {
        sqlite.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`);
      } catch {
        /* column exists */
      }
    }
  }

  for (const tbl of ["metric_points", "log_entries", "trace_spans"] as const) {
    try {
      sqlite.exec(`ALTER TABLE ${tbl} DROP COLUMN release_train`);
    } catch {
      /* missing or SQLite too old */
    }
  }

  sqlite.exec(`
UPDATE metric_points SET product = 'unknown' WHERE product IS NULL OR trim(product) = '';
UPDATE metric_points SET market = 'unknown' WHERE market IS NULL OR trim(market) = '';
UPDATE metric_points SET environment = 'unknown' WHERE environment IS NULL OR trim(environment) = '';
UPDATE log_entries SET product = 'unknown' WHERE product IS NULL OR trim(product) = '';
UPDATE log_entries SET market = 'unknown' WHERE market IS NULL OR trim(market) = '';
UPDATE log_entries SET environment = 'unknown' WHERE environment IS NULL OR trim(environment) = '';
UPDATE trace_spans SET product = 'unknown' WHERE product IS NULL OR trim(product) = '';
UPDATE trace_spans SET market = 'unknown' WHERE market IS NULL OR trim(market) = '';
UPDATE trace_spans SET environment = 'unknown' WHERE environment IS NULL OR trim(environment) = '';
`);

  sqlite.exec(`
CREATE INDEX IF NOT EXISTS metric_points_market_product_service_ts_idx ON metric_points(market, product, service, ts DESC);
CREATE INDEX IF NOT EXISTS log_entries_market_product_service_ts_idx ON log_entries(market, product, service, ts DESC);
CREATE INDEX IF NOT EXISTS trace_spans_market_product_service_ts_idx ON trace_spans(market, product, service, start_ts DESC);
CREATE INDEX IF NOT EXISTS trace_spans_market_env_ts_idx ON trace_spans(market, environment, start_ts DESC);
CREATE INDEX IF NOT EXISTS trace_spans_tenant_product_market_env_start_idx ON trace_spans(tenant_id, product, market, environment, start_ts);
CREATE INDEX IF NOT EXISTS trace_spans_tenant_service_market_start_idx ON trace_spans(tenant_id, service, market, start_ts);
CREATE INDEX IF NOT EXISTS log_entries_tenant_product_market_env_ts_idx ON log_entries(tenant_id, product, market, environment, ts);
CREATE INDEX IF NOT EXISTS log_entries_tenant_service_market_ts_idx ON log_entries(tenant_id, service, market, ts);
CREATE INDEX IF NOT EXISTS metric_points_tenant_product_market_env_ts_idx ON metric_points(tenant_id, product, market, environment, ts);
CREATE INDEX IF NOT EXISTS metric_points_tenant_name_product_market_ts_idx ON metric_points(tenant_id, name, product, market, ts);
`);
}

function migrateSloTargetsComposite(sqlite: InstanceType<typeof Database>) {
  const cols = sqlite
    .prepare(`PRAGMA table_info(slo_targets)`)
    .all() as { name: string }[];
  if (cols.some((c) => c.name === "product")) return;

  sqlite.exec(`
CREATE TABLE slo_targets_new (
  service TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT 'platform',
  market TEXT NOT NULL DEFAULT 'ALL',
  environment TEXT NOT NULL DEFAULT 'prod',
  target_success REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (service, product, market, environment)
);
INSERT INTO slo_targets_new (service, target_success, updated_at, product, market, environment)
  SELECT service, target_success, updated_at, 'platform', 'ALL', 'prod' FROM slo_targets;
DROP TABLE slo_targets;
ALTER TABLE slo_targets_new RENAME TO slo_targets;
`);
}

function migrateAlertRulesScope(sqlite: InstanceType<typeof Database>) {
  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN product TEXT;`);
  } catch {
    /* exists */
  }
  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN market_scope TEXT;`);
  } catch {
    /* exists */
  }
  try {
    sqlite.exec(
      `ALTER TABLE alert_rules ADD COLUMN environment TEXT NOT NULL DEFAULT 'prod';`,
    );
  } catch {
    /* exists */
  }
}

/** Idempotent: NULL = all markets (matches PG migration 0008). */
function migrateAlertRulesMarketScopeSentinels(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
UPDATE alert_rules
SET market_scope = NULL
WHERE market_scope IS NOT NULL
  AND (
    TRIM(market_scope) = ''
    OR UPPER(TRIM(market_scope)) IN ('ALL', '*')
  );
`);
}

function seedServiceCatalog(sqlite: InstanceType<typeof Database>) {
  const now = Date.now();
  const rows: [string, string, string, string, string, number, string][] = [
    [
      "notifications-api",
      "Notifications API",
      "platform",
      "shared",
      '["ZA","NG","KE","GH","EG"]',
      2,
      "platform-team",
    ],
    [
      "fraud-ml-api",
      "Fraud ML API",
      "platform",
      "shared",
      '["ZA","NG","KE","GH","EG"]',
      2,
      "risk-team",
    ],
    [
      "consumer-auth-api",
      "Consumer Auth API",
      "consumer",
      "shared",
      '["ZA","NG","KE","GH","EG"]',
      2,
      "consumer-team",
    ],
    ["ledger-ke", "Ledger (Kenya)", "platform", "market_local", '["KE"]', 1, "kenya-platform"],
    [
      "settlement-ng",
      "Settlement (Nigeria)",
      "platform",
      "market_local",
      '["NG"]',
      1,
      "nigeria-platform",
    ],
    ["kyc-za", "KYC (South Africa)", "platform", "market_local", '["ZA"]', 2, "sa-compliance"],
    [
      "consumer-payments-api",
      "Consumer Payments API",
      "consumer",
      "shared",
      '["ZA","NG","KE","GH","EG"]',
      1,
      "consumer-team",
    ],
    [
      "merchant-onboarding-zw",
      "Merchant Onboarding (Zimbabwe)",
      "merchant",
      "market_local",
      '["ZW"]',
      3,
      "zimbabwe-merchant",
    ],
  ];

  const stmt = sqlite.prepare(`
INSERT OR IGNORE INTO service_catalog (
  service_name, display_name, product, scope, markets_active, tier, owner_team, tags, created_at, updated_at, enabled
) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, 1)
`);
  for (const r of rows) {
    stmt.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], now, now);
  }
}

function migrateServiceCatalog(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS service_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  product TEXT NOT NULL,
  scope TEXT NOT NULL,
  markets_active TEXT NOT NULL DEFAULT '[]',
  tier INTEGER NOT NULL DEFAULT 3,
  owner_team TEXT,
  oncall_slack TEXT,
  oncall_pd_key TEXT,
  repo_url TEXT,
  runbook_url TEXT,
  tags TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  CHECK (scope IN ('shared','market_local')),
  CHECK (product IN ('consumer','merchant','agent','platform'))
);
`);
  try {
    sqlite.exec(
      `ALTER TABLE service_catalog ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`,
    );
  } catch {
    /* exists */
  }
  sqlite.exec(`
CREATE INDEX IF NOT EXISTS service_catalog_product_idx ON service_catalog(product);
CREATE INDEX IF NOT EXISTS service_catalog_scope_idx ON service_catalog(scope);
CREATE INDEX IF NOT EXISTS service_catalog_enabled_idx ON service_catalog(enabled);
`);
  seedServiceCatalog(sqlite);
}

/** One-shot hygiene: remove legacy `unknown` from catalog JSON arrays (matches PG migration 0009). */
/** PG-mirror of 0010 — adds severity column and alert_routes table. */
function migrateAlertRoutesAndSeverity(sqlite: InstanceType<typeof Database>) {
  try {
    sqlite.exec(
      `ALTER TABLE alert_rules ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning';`,
    );
  } catch {
    /* exists */
  }
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS alert_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_value TEXT,
  channel_type TEXT NOT NULL,
  channel_value TEXT NOT NULL,
  severity_min TEXT NOT NULL DEFAULT 'warning',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (scope_type IN ('market', 'team', 'default')),
  CHECK (channel_type IN ('slack', 'pagerduty', 'webhook', 'email')),
  CHECK (severity_min IN ('info', 'warning', 'critical'))
);
CREATE UNIQUE INDEX IF NOT EXISTS alert_routes_scoped_uidx
  ON alert_routes (scope_type, scope_value, channel_type)
  WHERE scope_value IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alert_routes_default_uidx
  ON alert_routes (scope_type, channel_type)
  WHERE scope_value IS NULL;
CREATE INDEX IF NOT EXISTS alert_routes_scope_lookup_idx
  ON alert_routes (scope_type, scope_value)
  WHERE enabled = 1;
`);
}

function migrateCatalogStripUnknownMarkets(sqlite: InstanceType<typeof Database>) {
  const rows = sqlite
    .prepare(
      `SELECT service_name, markets_active FROM service_catalog`,
    )
    .all() as { service_name: string; markets_active: string }[];
  const upd = sqlite.prepare(
    `UPDATE service_catalog SET markets_active = ?, scope = ?, updated_at = ? WHERE service_name = ?`,
  );
  const now = Date.now();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.markets_active) as unknown;
      if (!Array.isArray(parsed)) continue;
      const filtered = parsed.filter(
        (x) =>
          typeof x === "string" &&
          x.trim().length > 0 &&
          x.trim().toLowerCase() !== "unknown",
      );
      if (filtered.length === parsed.length) continue;
      const scope = filtered.length >= 2 ? "shared" : "market_local";
      upd.run(JSON.stringify(filtered), scope, now, row.service_name);
    } catch {
      /* skip malformed */
    }
  }
}

/** Adds log-pattern alerting columns — idempotent. */
function migrateLogPatternAlertCols(sqlite: InstanceType<typeof Database>) {
  const cols: [string, string][] = [
    ["rule_type",    "TEXT NOT NULL DEFAULT 'metric'"],
    ["log_level",    "TEXT"],
    ["log_pattern",  "TEXT"],
  ];
  for (const [col, def] of cols) {
    try {
      sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN ${col} ${def};`);
    } catch { /* exists */ }
  }
}

/** Adds SLO burn-rate alerting columns — idempotent. */
function migrateSloBurnAlertCols(sqlite: InstanceType<typeof Database>) {
  const cols: [string, string][] = [
    ["slo_burn_window",    "TEXT NOT NULL DEFAULT '1h'"],
    ["slo_burn_threshold", "REAL NOT NULL DEFAULT 2.0"],
  ];
  for (const [col, def] of cols) {
    try {
      sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN ${col} ${def};`);
    } catch { /* exists */ }
  }
}

function initSqlite() {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
CREATE TABLE IF NOT EXISTS metric_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  service TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  product TEXT NOT NULL DEFAULT 'unknown',
  market TEXT NOT NULL DEFAULT 'unknown',
  environment TEXT NOT NULL DEFAULT 'unknown',
  version TEXT NOT NULL DEFAULT '',
  instance_id TEXT
);
CREATE INDEX IF NOT EXISTS metric_points_ts_idx ON metric_points(ts);
CREATE INDEX IF NOT EXISTS metric_points_name_service_ts_idx ON metric_points(name, service, ts);

CREATE TABLE IF NOT EXISTS log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  service TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  product TEXT NOT NULL DEFAULT 'unknown',
  market TEXT NOT NULL DEFAULT 'unknown',
  environment TEXT NOT NULL DEFAULT 'unknown',
  version TEXT NOT NULL DEFAULT '',
  instance_id TEXT
);
CREATE INDEX IF NOT EXISTS log_entries_ts_idx ON log_entries(ts);
CREATE INDEX IF NOT EXISTS log_entries_service_ts_idx ON log_entries(service, ts);

CREATE TABLE IF NOT EXISTS trace_spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL UNIQUE,
  parent_span_id TEXT,
  service TEXT NOT NULL,
  name TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  duration_ms REAL NOT NULL,
  kind TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'ok',
  peer_service TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  events_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '[]',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  product TEXT NOT NULL DEFAULT 'unknown',
  market TEXT NOT NULL DEFAULT 'unknown',
  environment TEXT NOT NULL DEFAULT 'unknown',
  version TEXT NOT NULL DEFAULT '',
  instance_id TEXT
);
CREATE INDEX IF NOT EXISTS trace_spans_trace_id_idx ON trace_spans(trace_id);
CREATE INDEX IF NOT EXISTS trace_spans_start_ts_idx ON trace_spans(start_ts);
CREATE INDEX IF NOT EXISTS trace_spans_service_start_idx ON trace_spans(service, start_ts);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  metric_name TEXT NOT NULL,
  service TEXT NOT NULL,
  comparator TEXT NOT NULL,
  threshold REAL NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  product TEXT,
  market_scope TEXT,
  environment TEXT NOT NULL DEFAULT 'prod'
);

CREATE TABLE IF NOT EXISTS slo_targets (
  service TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT 'platform',
  market TEXT NOT NULL DEFAULT 'ALL',
  environment TEXT NOT NULL DEFAULT 'prod',
  target_success REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (service, product, market, environment)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_views_tenant_page_name_uidx ON saved_views(tenant_id, page, name);
CREATE INDEX IF NOT EXISTS saved_views_tenant_page_idx ON saved_views(tenant_id, page);

CREATE TABLE IF NOT EXISTS alert_silences (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  rule_id INTEGER,
  ends_at_ms INTEGER NOT NULL,
  reason TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_silences_tenant_ends_idx ON alert_silences(tenant_id, ends_at_ms);

CREATE TABLE IF NOT EXISTS alert_eval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  rule_id INTEGER NOT NULL,
  evaluated_at_ms INTEGER NOT NULL,
  firing INTEGER NOT NULL DEFAULT 0,
  observed_avg REAL,
  silenced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alert_eval_history_tenant_ts_idx ON alert_eval_history(tenant_id, evaluated_at_ms);

CREATE TABLE IF NOT EXISTS alert_notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  rule_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  sent_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_notification_log_dedupe_idx ON alert_notification_log(tenant_id, rule_id, channel, sent_at_ms);
`);

  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN webhook_url TEXT;`);
  } catch {
    /* column exists */
  }

  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN runbook_url TEXT;`);
  } catch {
    /* column exists */
  }

  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN slack_webhook_url TEXT;`);
  } catch {
    /* exists */
  }
  try {
    sqlite.exec(`ALTER TABLE alert_rules ADD COLUMN pagerduty_routing_key TEXT;`);
  } catch {
    /* exists */
  }

  migrateTelemetryTenant(sqlite);
  migrateSloTargetsComposite(sqlite);
  migrateAlertRulesScope(sqlite);
  migrateAlertRulesMarketScopeSentinels(sqlite);
  migrateServiceCatalog(sqlite);
  migrateCatalogStripUnknownMarkets(sqlite);
  migrateAlertRoutesAndSeverity(sqlite);
  migrateLogPatternAlertCols(sqlite);
  migrateSloBurnAlertCols(sqlite);

  return sqlite;
}

const sqliteDb = isPostgres() ? null : initSqlite();

export const db = sqliteDb ? drizzle(sqliteDb, { schema }) : null;

/** Raw SQLite handle; null when `DATABASE_URL` selects Postgres. */
export const sqlite = sqliteDb;
