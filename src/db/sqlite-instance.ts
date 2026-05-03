import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import { isPostgres } from "@/lib/sql-dialect";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "observability.db");

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
  labels_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS metric_points_ts_idx ON metric_points(ts);
CREATE INDEX IF NOT EXISTS metric_points_name_service_ts_idx ON metric_points(name, service, ts);

CREATE TABLE IF NOT EXISTS log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  service TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}'
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
  attributes_json TEXT NOT NULL DEFAULT '{}'
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
  window_minutes INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS slo_targets (
  service TEXT NOT NULL PRIMARY KEY,
  target_success REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
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

  return sqlite;
}

const sqliteDb = isPostgres() ? null : initSqlite();

export const db = sqliteDb ? drizzle(sqliteDb, { schema }) : null;

/** Raw SQLite handle; null when `DATABASE_URL` selects Postgres. */
export const sqlite = sqliteDb;
