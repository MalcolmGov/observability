import "server-only";

import { queryAll, queryGet, queryRun } from "@/db/client";
import { getPgPool } from "@/db/pg-pool";
import type { TraceRow } from "@/db/writes";
import { isPostgres } from "@/lib/sql-dialect";

const DEBOUNCE_MS = 60_000;
const lastUpsertMsByService = new Map<string, number>();

const VALID_PRODUCT = new Set(["consumer", "merchant", "agent", "platform"]);

function normalizeProduct(raw: string): string {
  const t = raw.trim().toLowerCase();
  return VALID_PRODUCT.has(t) ? t : "platform";
}

/** Drop legacy placeholder market from telemetry; never persist it into `markets_active`. */
function isRecordedMarket(m: string): boolean {
  return Boolean(m.trim()) && m.trim().toLowerCase() !== "unknown";
}

function mergeMarkets(a: string[], b: string[]): string[] {
  return [
    ...new Set(
      [...a, ...b]
        .map((x) => x.trim())
        .filter(isRecordedMarket),
    ),
  ];
}

/**
 * After trace ingest, stub or refresh `service_catalog` rows from distinct markets in `trace_spans`.
 * Debounced to at most once per minute per `service_name` to avoid catalog churn under load.
 *
 * Omits `market = unknown` from `markets_active` (legacy placeholder); empty array until real tags appear.
 *
 * When merged `markets_active` grows past one distinct market, `scope` flips **market_local → shared**
 * (a previously KE-only row is promoted if NG traffic appears).
 *
 * Discovery edge case: if the most recent upsert left `markets_active = []` (e.g. first span carried
 * `market = unknown`), we clear the debounce timer for that service so the very next span — which is
 * presumably the first one carrying a real market tag — bypasses the 60s gate and lands immediately.
 * Once a real market is recorded, normal debouncing resumes.
 */
export function scheduleCatalogUpsertFromTraceRows(rows: TraceRow[]): void {
  if (rows.length === 0) return;
  const services = [
    ...new Set(rows.map((r) => r.service).filter((s) => s && s.trim())),
  ];
  const now = Date.now();
  const due: string[] = [];
  for (const s of services) {
    const prev = lastUpsertMsByService.get(s) ?? 0;
    if (now - prev < DEBOUNCE_MS) continue;
    lastUpsertMsByService.set(s, now);
    due.push(s);
  }
  if (due.length === 0) return;

  void runCatalogUpserts(due).catch((err) => {
    console.error("[catalog-sync]", err);
  });
}

async function runCatalogUpserts(serviceNames: string[]): Promise<void> {
  for (const serviceName of serviceNames) {
    await upsertOneService(serviceName);
  }
}

async function upsertOneService(serviceName: string): Promise<void> {
  const marketRows = await queryAll<{ market: string }>(
    `SELECT DISTINCT market FROM trace_spans WHERE service = ?`,
    [serviceName],
  );
  const markets = mergeMarkets(
    [],
    marketRows.map((r) => r.market).filter(isRecordedMarket),
  );

  const scope = markets.length >= 2 ? "shared" : "market_local";

  const prodRow = await queryGet<{ product: string }>(
    `SELECT product FROM trace_spans WHERE service = ? ORDER BY start_ts DESC LIMIT 1`,
    [serviceName],
  );
  const product = normalizeProduct(prodRow?.product ?? "platform");

  const now = Date.now();

  if (isPostgres()) {
    const pool = await getPgPool();
    const result = await pool.query<{ markets_active: string[] }>(
      `
      INSERT INTO service_catalog (
        service_name, display_name, product, scope, markets_active,
        tier, owner_team, oncall_slack, oncall_pd_key, repo_url, runbook_url,
        tags, created_at, updated_at, enabled
      ) VALUES (
        $1, NULL, $2, $3, $4::text[],
        3, NULL, NULL, NULL, NULL, NULL,
        '{}'::jsonb, $5, $5, 1
      )
      ON CONFLICT (service_name) DO UPDATE SET
        -- Merge old + new markets; if cardinality exceeds 1, promote to shared (see comment in 0007 migration).
        markets_active = (
          SELECT ARRAY(
            SELECT DISTINCT u FROM unnest(
              COALESCE(service_catalog.markets_active, '{}'::text[]) || EXCLUDED.markets_active
            ) AS u
            WHERE lower(trim(u)) IS DISTINCT FROM 'unknown'
          )
        ),
        scope = CASE
          WHEN cardinality(
            ARRAY(
              SELECT DISTINCT u FROM unnest(
                COALESCE(service_catalog.markets_active, '{}'::text[]) || EXCLUDED.markets_active
              ) AS u
              WHERE lower(trim(u)) IS DISTINCT FROM 'unknown'
            )
          ) >= 2 THEN 'shared'
          ELSE 'market_local'
        END,
        updated_at = EXCLUDED.updated_at
      RETURNING markets_active
      `,
      [serviceName, product, scope, markets, now],
    );
    const finalMarkets = result.rows[0]?.markets_active ?? [];
    if (finalMarkets.length === 0) {
      // Discovery still incomplete — clear timer so the next span bypasses the debounce.
      lastUpsertMsByService.delete(serviceName);
    }
    return;
  }

  const existing = await queryGet<{
    markets_active: string;
    scope: string;
  }>(
    `SELECT markets_active, scope FROM service_catalog WHERE service_name = ?`,
    [serviceName],
  );

  let mergedMarkets = [...markets];
  if (existing?.markets_active) {
    try {
      const parsed = JSON.parse(existing.markets_active) as unknown;
      if (Array.isArray(parsed)) {
        mergedMarkets = mergeMarkets(
          mergedMarkets,
          parsed.filter(
            (x): x is string => typeof x === "string" && isRecordedMarket(x),
          ),
        );
      }
    } catch {
      /* ignore */
    }
  }
  const mergedScope = mergedMarkets.length >= 2 ? "shared" : "market_local";
  const marketsJson = JSON.stringify(mergedMarkets);

  if (existing) {
    await queryRun(
      `UPDATE service_catalog SET markets_active = ?, scope = ?, updated_at = ?
       WHERE service_name = ?`,
      [marketsJson, mergedScope, now, serviceName],
    );
  } else {
    await queryRun(
      `INSERT INTO service_catalog (
        service_name, display_name, product, scope, markets_active,
        tier, owner_team, oncall_slack, oncall_pd_key, repo_url, runbook_url,
        tags, created_at, updated_at, enabled
      ) VALUES (?, NULL, ?, ?, ?, 3, NULL, NULL, NULL, NULL, NULL, '{}', ?, ?, 1)`,
      [serviceName, product, mergedScope, marketsJson, now, now],
    );
  }

  if (mergedMarkets.length === 0) {
    // Discovery still incomplete — clear timer so the next span bypasses the debounce.
    lastUpsertMsByService.delete(serviceName);
  }
}
