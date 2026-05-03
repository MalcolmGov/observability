import { queryAll } from "@/db/client";
import { appendScopeSql, parseScopeFilters } from "@/lib/scope-filters";
import { percentilesFromValues } from "@/lib/stats";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_SPANS = 50_000;

function defaultBucketMs(windowMs: number): number {
  if (windowMs <= 15 * 60 * 1000) return 60_000;
  if (windowMs <= 60 * 60 * 1000) return 60_000;
  if (windowMs <= 6 * 60 * 60 * 1000) return 5 * 60_000;
  return 15 * 60_000;
}

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const now = Date.now();
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;
  const { sql: scopeSql, params: scopeParams } = appendScopeSql(scope);

  const requested = Number(searchParams.get("windowMs"));
  const windowMs = Number.isFinite(requested)
    ? Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, requested))
    : DEFAULT_WINDOW_MS;
  const since = now - windowMs;

  const bucketParam = Number(searchParams.get("bucketMs"));
  const bucketMs =
    Number.isFinite(bucketParam) && bucketParam >= 10_000
      ? Math.min(bucketParam, 60 * 60_000)
      : defaultBucketMs(windowMs);

  const rows = await queryAll<{ startTs: number; durationMs: number }>(
    `
    SELECT start_ts AS startTs, duration_ms AS durationMs
    FROM trace_spans
    WHERE tenant_id = ? AND service = ?
      AND start_ts >= ? AND start_ts <= ?
      AND (parent_span_id IS NULL OR parent_span_id = '')${scopeSql}
    LIMIT ?
  `,
    [tenantId, service, since, now, ...scopeParams, MAX_SPANS],
  );

  const buckets = new Map<number, number[]>();
  for (const r of rows) {
    const startTs = Number(r.startTs);
    const t = Math.floor(startTs / bucketMs) * bucketMs;
    let arr = buckets.get(t);
    if (!arr) {
      arr = [];
      buckets.set(t, arr);
    }
    arr.push(Number(r.durationMs));
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, durations]) => {
      const p = percentilesFromValues(durations);
      return {
        t,
        p50Ms: p.p50,
        p95Ms: p.p95,
        p99Ms: p.p99,
        count: durations.length,
      };
    });

  return NextResponse.json({
    generatedAtMs: now,
    windowMs,
    bucketMs,
    service,
    scope,
    series,
    truncated: rows.length >= MAX_SPANS,
  });
}
