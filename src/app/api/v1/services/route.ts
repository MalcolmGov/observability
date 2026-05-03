import { queryAll } from "@/db/client";
import { appendScopeSql, parseScopeFilters } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const scopeParsed = parseScopeFilters(new URL(req.url).searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;
  const { sql: scopeSql, params: scopeParams } = appendScopeSql(scope);

  const rows = await queryAll<{ service: string }>(
    `
    SELECT DISTINCT service FROM metric_points WHERE tenant_id = ?${scopeSql}
    UNION
    SELECT DISTINCT service FROM log_entries WHERE tenant_id = ?${scopeSql}
    UNION
    SELECT DISTINCT service FROM trace_spans WHERE tenant_id = ?${scopeSql}
    ORDER BY service ASC
  `,
    [tenantId, ...scopeParams, tenantId, ...scopeParams, tenantId, ...scopeParams],
  );
  const services = rows.map((r) => r.service).filter(Boolean);

  return NextResponse.json({ services, scope });
}
