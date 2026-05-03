import { insertMetricPoints } from "@/db/client";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { OTLP_MAX_METRIC_SAMPLES } from "@/lib/otlp/limits";
import { otlpJsonToMetricRows } from "@/lib/otlp/metrics";
import { readOtlpHttpBody } from "@/lib/otlp/read-json-body";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * OTLP/HTTP metrics — JSON encoding (`ExportMetricsServiceRequest`).
 */
export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const gated = ingestPreReadGuards(req, "otlp");
  if (gated) return gated;

  const tenantGate = resolveIngestTenantId(req);
  if (tenantGate instanceof NextResponse) return tenantGate;
  const tenantId = tenantGate;

  const parsed = await readOtlpHttpBody(req, "metrics");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { rows: metricRows, notices } = otlpJsonToMetricRows(parsed.data);
  const rows = metricRows.map((r) => ({
    ...r,
    tenantId,
  }));
  if (rows.length > OTLP_MAX_METRIC_SAMPLES) {
    return NextResponse.json(
      {
        error: `Too many metric samples in one request (max ${OTLP_MAX_METRIC_SAMPLES})`,
      },
      { status: 413 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(notices.length ? { notices } : {});
  }

  await insertMetricPoints(rows);
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json(notices.length ? { notices } : {});
}
