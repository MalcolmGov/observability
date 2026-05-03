import { queryAll } from "@/db/client";
import { parseScopeFilters, scopeSqlFragments } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;
  const { fragments: scopeParts, params: scopeParams } = scopeSqlFragments(scope);

  const service = searchParams.get("service");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const sinceMs = Number(searchParams.get("sinceMs"));
  const since =
    Number.isFinite(sinceMs) && sinceMs > 0
      ? sinceMs
      : Date.now() - 24 * 60 * 60 * 1000;

  const errorsOnly = searchParams.get("errorsOnly") === "1";
  const minDurRaw = Number(searchParams.get("minDurationMs"));
  const minDurationMs =
    Number.isFinite(minDurRaw) && minDurRaw > 0 ? minDurRaw : null;

  const filters: string[] = ["tenant_id = ?", "start_ts >= ?", ...scopeParts];
  const params: unknown[] = [tenantId, since, ...scopeParams];

  const having: string[] = [];
  if (service) {
    having.push(`SUM(CASE WHEN service = ? THEN 1 ELSE 0 END) > 0`);
    params.push(service);
  }
  if (errorsOnly) {
    having.push(`SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) > 0`);
  }
  if (minDurationMs != null) {
    having.push(`(MAX(end_ts) - MIN(start_ts)) >= ?`);
    params.push(minDurationMs);
  }

  const havingSql =
    having.length > 0 ? `HAVING ${having.join(" AND ")}` : "";

  const sql = `
    SELECT
      trace_id AS traceId,
      MIN(start_ts) AS startTs,
      MAX(end_ts) AS endTs,
      MAX(end_ts) - MIN(start_ts) AS durationMs,
      COUNT(*) AS spanCount,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
      (
        SELECT s.service FROM trace_spans s
        WHERE s.trace_id = trace_spans.trace_id
          AND s.tenant_id = trace_spans.tenant_id
        ORDER BY s.start_ts ASC LIMIT 1
      ) AS rootService,
      (
        SELECT s2.name FROM trace_spans s2
        WHERE s2.trace_id = trace_spans.trace_id
          AND s2.tenant_id = trace_spans.tenant_id
        ORDER BY s2.start_ts ASC LIMIT 1
      ) AS rootName
    FROM trace_spans
    WHERE ${filters.join(" AND ")}
    GROUP BY trace_id, tenant_id
    ${havingSql}
    ORDER BY MIN(start_ts) DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = await queryAll<{
    traceId: string;
    startTs: number;
    endTs: number;
    durationMs: number;
    spanCount: number;
    errorCount: number;
    rootService: string | null;
    rootName: string | null;
  }>(sql, params);

  const traces = rows.map((r) => ({
    traceId: r.traceId,
    startTs: Number(r.startTs),
    endTs: Number(r.endTs),
    durationMs: Number(r.durationMs),
    spanCount: Number(r.spanCount),
    errorCount: Number(r.errorCount),
    rootService: r.rootService ?? "unknown",
    rootName: r.rootName ?? "",
  }));

  return NextResponse.json({
    traces,
    since,
    scope,
    filters: { errorsOnly, minDurationMs },
  });
}
