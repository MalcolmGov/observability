import { queryAll } from "@/db/client";
import { appendScopeSql, parseScopeFilters } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

type BucketRow = { bucket: number; avg_value: number };

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  const service = searchParams.get("service");
  const start = Number(searchParams.get("start"));
  const end = Number(searchParams.get("end"));
  const bucketMs = Number(searchParams.get("bucketMs")) || 60_000;

  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;
  const { sql: scopeSql, params: scopeParams } = appendScopeSql(scope);

  if (!name || !service || !Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid query params: name, service, start, end (unix ms)",
      },
      { status: 400 },
    );
  }

  if (end <= start) {
    return NextResponse.json(
      { error: "end must be greater than start" },
      { status: 400 },
    );
  }

  const rows = await queryAll<BucketRow>(
    `
    SELECT
      (ts / ?) * ? AS bucket,
      AVG(value) AS avg_value
    FROM metric_points
    WHERE tenant_id = ? AND name = ? AND service = ? AND ts >= ? AND ts <= ?${scopeSql}
    GROUP BY 1
    ORDER BY 1
  `,
    [bucketMs, bucketMs, tenantId, name, service, start, end, ...scopeParams],
  );

  const series = rows.map((r) => ({
    t: Number(r.bucket),
    value: Number(r.avg_value),
  }));

  return NextResponse.json({
    name,
    service,
    scope,
    start,
    end,
    bucketMs,
    series,
  });
}
