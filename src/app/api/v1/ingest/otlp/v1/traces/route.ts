import { insertTraceSpans } from "@/db/client";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { OTLP_MAX_SPANS } from "@/lib/otlp/limits";
import { readOtlpHttpBody } from "@/lib/otlp/read-json-body";
import { otlpJsonToTraceRows } from "@/lib/otlp/traces";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * OTLP/HTTP traces — JSON encoding (`ExportTraceServiceRequest`).
 * Collector endpoint base: `/api/v1/ingest/otlp` (appends `/v1/traces`).
 */
export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const gated = ingestPreReadGuards(req, "otlp");
  if (gated) return gated;

  const tenantGate = resolveIngestTenantId(req);
  if (tenantGate instanceof NextResponse) return tenantGate;
  const tenantId = tenantGate;

  const parsed = await readOtlpHttpBody(req, "traces");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const rows = otlpJsonToTraceRows(parsed.data).map((r) => ({
    ...r,
    tenantId,
  }));
  if (rows.length > OTLP_MAX_SPANS) {
    return NextResponse.json(
      { error: `Too many spans in one request (max ${OTLP_MAX_SPANS})` },
      { status: 413 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({});
  }

  await insertTraceSpans(rows, { ignoreDuplicateSpanIds: true });
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json({});
}
