import { queryAll } from "@/db/client";
import { parsePromQlInstantSelector } from "@/lib/promql-lite";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";

type BucketRow = { bucket: number; avg_value: number };

/**
 * PromQL-compatible **subset**: one instant selector `metric` or `metric{k="v",…}`.
 * Label `service` maps to the `service` column; other labels match `labels_json` keys.
 */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const start = Number(searchParams.get("start"));
  const end = Number(searchParams.get("end"));
  const bucketMs = Number(searchParams.get("bucketMs")) || 60_000;

  const parsed = parsePromQlInstantSelector(qRaw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Invalid PromQL (supported: metric_name or metric_name{service="x",label="y"})',
      },
      { status: 400 },
    );
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return NextResponse.json(
      {
        error: "Missing or invalid query params: start, end (unix ms)",
      },
      { status: 400 },
    );
  }

  const { metric, labels } = parsed;
  const dialect = isPostgres() ? "postgres" : "sqlite";

  const parts = [
    `SELECT`,
    `  (ts / ?) * ? AS bucket,`,
    `  AVG(value) AS avg_value`,
    `FROM metric_points`,
    `WHERE tenant_id = ? AND name = ?`,
  ];
  const params: unknown[] = [bucketMs, bucketMs, tenantId, metric];

  const restLabels = { ...labels };
  const svc = restLabels.service;
  if (svc !== undefined) {
    parts.push(`AND service = ?`);
    params.push(svc);
    delete restLabels.service;
  }

  for (const [k, v] of Object.entries(restLabels)) {
    if (dialect === "postgres") {
      parts.push(`AND COALESCE(labels_json::jsonb ->> ?, '') = ?`);
      params.push(k, v);
    } else {
      parts.push(`AND json_extract(labels_json, '$.' || ?) = ?`);
      params.push(k, v);
    }
  }

  parts.push(`AND ts >= ? AND ts <= ?`);
  params.push(start, end);
  parts.push(`GROUP BY 1`);
  parts.push(`ORDER BY 1`);

  const rows = await queryAll<BucketRow>(parts.join("\n"), params);

  const series = rows.map((r) => ({
    t: Number(r.bucket),
    value: Number(r.avg_value),
  }));

  return NextResponse.json({
    promql: qRaw,
    parsed: { metric, labels },
    start,
    end,
    bucketMs,
    series,
  });
}
