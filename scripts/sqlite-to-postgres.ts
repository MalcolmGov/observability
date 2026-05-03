/**
 * One-way copy of telemetry from local SQLite (./data/observability.db by default)
 * into Postgres (DATABASE_URL). Applies Drizzle Postgres migrations (same as the app).
 *
 * Usage (from observability/):
 *   DATABASE_URL="postgresql://..." npm run db:migrate-sqlite-to-pg -- --truncate
 *
 * Flags:
 *   --truncate     TRUNCATE all Pulse tables in Postgres before copy (recommended).
 *   --sqlite=PATH  SQLite file path (default: ./data/observability.db).
 *   --append       Skip empty-target check; INSERT anyway (may fail on unique keys).
 */

import Database from "better-sqlite3";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { runPostgresMigrations } from "../src/db/pg-migrate";

function placeholders(rowCount: number, cols: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const ps: string[] = [];
    for (let c = 0; c < cols; c++) {
      ps.push(`$${r * cols + c + 1}`);
    }
    rows.push(`(${ps.join(",")})`);
  }
  return rows.join(",");
}

async function batchInsert(
  pool: Pool,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  batchSize: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const colList = columns.join(", ");
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const flat = chunk.flatMap((row) => columns.map((c) => row[c] ?? null));
    const ph = placeholders(chunk.length, columns.length);
    await pool.query(`INSERT INTO ${table} (${colList}) VALUES ${ph}`, flat);
    inserted += chunk.length;
  }
  return inserted;
}

async function pgCounts(pool: Pool) {
  const r = await pool.query<{
    m: string;
    l: string;
    t: string;
    a: string;
    s: string;
    c: string;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM metric_points) AS m,
      (SELECT COUNT(*) FROM log_entries) AS l,
      (SELECT COUNT(*) FROM trace_spans) AS t,
      (SELECT COUNT(*) FROM alert_rules) AS a,
      (SELECT COUNT(*) FROM slo_targets) AS s,
      (SELECT COUNT(*) FROM service_catalog) AS c`,
  );
  return r.rows[0];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const truncate = process.argv.includes("--truncate");
  const append = process.argv.includes("--append");
  const sqliteArg = process.argv.find((a) => a.startsWith("--sqlite="));
  const sqlitePath = sqliteArg
    ? sqliteArg.slice("--sqlite=".length)
    : path.join(process.cwd(), "data", "observability.db");

  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
  });

  try {
    await runPostgresMigrations(pool);

    const counts = await pgCounts(pool);
    const totalPg =
      Number(counts.m) +
      Number(counts.l) +
      Number(counts.t) +
      Number(counts.a) +
      Number(counts.s) +
      Number(counts.c);

    if (totalPg > 0 && !truncate && !append) {
      console.error(
        "Postgres already has data. Re-run with --truncate (replace) or --append (may conflict on unique span_id).",
      );
      console.error("Current counts:", counts);
      process.exit(1);
    }

    if (truncate) {
      await pool.query(`
        TRUNCATE TABLE trace_spans, log_entries, metric_points, alert_rules, slo_targets, service_catalog, _pulse_kv
        RESTART IDENTITY CASCADE
      `);
      console.log("Truncated Postgres Pulse tables.");
    }

    const sqlite = new Database(sqlitePath, { readonly: true });

    const catalogRows = sqlite
      .prepare(
        `SELECT service_name, display_name, product, scope, markets_active, tier, owner_team, oncall_slack, oncall_pd_key, repo_url, runbook_url, tags, created_at, updated_at,
                COALESCE(enabled, 1) AS enabled
         FROM service_catalog ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const catalogForPg = catalogRows.map((row) => {
      let markets: string[] = [];
      try {
        const parsed = JSON.parse(String(row.markets_active ?? "[]")) as unknown;
        markets = Array.isArray(parsed)
          ? parsed.filter((x): x is string => typeof x === "string")
          : [];
      } catch {
        markets = [];
      }
      let tags: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(row.tags ?? "{}")) as unknown;
        tags =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
      } catch {
        tags = {};
      }
      return {
        ...row,
        markets_active: markets,
        tags,
      };
    });
    const nC = await batchInsert(
      pool,
      "service_catalog",
      [
        "service_name",
        "display_name",
        "product",
        "scope",
        "markets_active",
        "tier",
        "owner_team",
        "oncall_slack",
        "oncall_pd_key",
        "repo_url",
        "runbook_url",
        "tags",
        "created_at",
        "updated_at",
        "enabled",
      ],
      catalogForPg,
      50,
    );
    console.log(`service_catalog: ${nC} rows`);

    const metrics = sqlite
      .prepare(
        `SELECT tenant_id, ts, name, value, service, labels_json, product, market, environment, version, instance_id FROM metric_points ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const nM = await batchInsert(
      pool,
      "metric_points",
      [
        "tenant_id",
        "ts",
        "name",
        "value",
        "service",
        "labels_json",
        "product",
        "market",
        "environment",
        "version",
        "instance_id",
      ],
      metrics,
      250,
    );
    console.log(`metric_points: ${nM} rows`);

    const logs = sqlite
      .prepare(
        `SELECT tenant_id, ts, level, message, service, attributes_json, product, market, environment, version, instance_id FROM log_entries ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const nL = await batchInsert(
      pool,
      "log_entries",
      [
        "tenant_id",
        "ts",
        "level",
        "message",
        "service",
        "attributes_json",
        "product",
        "market",
        "environment",
        "version",
        "instance_id",
      ],
      logs,
      250,
    );
    console.log(`log_entries: ${nL} rows`);

    const spans = sqlite
      .prepare(
        `SELECT tenant_id, trace_id, span_id, parent_span_id, service, name, start_ts, end_ts, duration_ms, kind, status, peer_service, attributes_json, events_json, links_json, product, market, environment, version, instance_id
         FROM trace_spans ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const nT = await batchInsert(
      pool,
      "trace_spans",
      [
        "tenant_id",
        "trace_id",
        "span_id",
        "parent_span_id",
        "service",
        "name",
        "start_ts",
        "end_ts",
        "duration_ms",
        "kind",
        "status",
        "peer_service",
        "attributes_json",
        "events_json",
        "links_json",
        "product",
        "market",
        "environment",
        "version",
        "instance_id",
      ],
      spans,
      150,
    );
    console.log(`trace_spans: ${nT} rows`);

    const rules = sqlite
      .prepare(
        `SELECT name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key, product, market_scope, environment
         FROM alert_rules ORDER BY id`,
      )
      .all() as Record<string, unknown>[];
    const nA = await batchInsert(
      pool,
      "alert_rules",
      [
        "name",
        "enabled",
        "metric_name",
        "service",
        "comparator",
        "threshold",
        "window_minutes",
        "webhook_url",
        "runbook_url",
        "slack_webhook_url",
        "pagerduty_routing_key",
        "product",
        "market_scope",
        "environment",
      ],
      rules,
      100,
    );
    console.log(`alert_rules: ${nA} rows`);

    const slos = sqlite
      .prepare(
        `SELECT service, product, market, environment, target_success, updated_at FROM slo_targets`,
      )
      .all() as Record<string, unknown>[];
    const nS = await batchInsert(
      pool,
      "slo_targets",
      [
        "service",
        "product",
        "market",
        "environment",
        "target_success",
        "updated_at",
      ],
      slos,
      100,
    );
    console.log(`slo_targets: ${nS} rows`);

    sqlite.close();

    console.log("Done. Postgres counts:", await pgCounts(pool));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
