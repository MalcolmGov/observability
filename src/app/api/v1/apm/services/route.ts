import { queryAll } from "@/db/client";
import { appendScopeSql, parseScopeFilters } from "@/lib/scope-filters";
import { percentilesFromValues } from "@/lib/stats";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const now = Date.now();
  const { searchParams } = new URL(req.url);
  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;
  const { sql: scopeSql, params: scopeParams } = appendScopeSql(scope);

  const requested = Number(searchParams.get("windowMs"));
  const windowMs = Number.isFinite(requested)
    ? Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, requested))
    : DEFAULT_WINDOW_MS;
  const since = now - windowMs;

  const traceRows = await queryAll<{ service: string; traces: number }>(
    `
    SELECT service, COUNT(DISTINCT trace_id) AS traces
    FROM trace_spans
    WHERE tenant_id = ? AND start_ts >= ? AND start_ts <= ?${scopeSql}
    GROUP BY service
  `,
    [tenantId, since, now, ...scopeParams],
  );

  const roots = await queryAll<{
    service: string;
    durationMs: number;
    status: string;
  }>(
    `
    SELECT service, duration_ms AS durationMs, status
    FROM trace_spans
    WHERE tenant_id = ? AND start_ts >= ? AND start_ts <= ?
      AND (parent_span_id IS NULL OR parent_span_id = '')${scopeSql}
  `,
    [tenantId, since, now, ...scopeParams],
  );

  type Agg = { durations: number[]; requests: number; errors: number };
  const byRoot = new Map<string, Agg>();
  for (const r of roots) {
    let a = byRoot.get(r.service);
    if (!a) {
      a = { durations: [], requests: 0, errors: 0 };
      byRoot.set(r.service, a);
    }
    a.requests += 1;
    a.durations.push(Number(r.durationMs));
    if (r.status === "error") a.errors += 1;
  }

  const services = traceRows
    .map(({ service, traces }) => {
      const root = byRoot.get(service);
      if (!root || root.requests === 0) {
        return {
          service,
          traces: Number(traces),
          requests: 0,
          errorCount: 0,
          errorRate: 0,
          avgDurationMs: null as number | null,
          p50Ms: null as number | null,
          p95Ms: null as number | null,
          p99Ms: null as number | null,
        };
      }
      const { p50, p95, p99, avg } = percentilesFromValues(root.durations);
      return {
        service,
        traces: Number(traces),
        requests: root.requests,
        errorCount: root.errors,
        errorRate: root.requests ? root.errors / root.requests : 0,
        avgDurationMs: avg,
        p50Ms: p50,
        p95Ms: p95,
        p99Ms: p99,
      };
    })
    .sort(
      (a, b) =>
        b.traces - a.traces ||
        b.requests - a.requests ||
        a.service.localeCompare(b.service),
    );

  return NextResponse.json({
    generatedAtMs: now,
    windowMs,
    scope,
    services,
  });
}
