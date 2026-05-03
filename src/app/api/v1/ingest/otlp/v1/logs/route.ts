import { insertLogEntries } from "@/db/client";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { OTLP_MAX_LOGS } from "@/lib/otlp/limits";
import { otlpJsonToLogRows } from "@/lib/otlp/logs";
import { readOtlpHttpBody } from "@/lib/otlp/read-json-body";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * OTLP/HTTP logs — JSON encoding (`ExportLogsServiceRequest`).
 */
export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const gated = ingestPreReadGuards(req, "otlp");
  if (gated) return gated;

  const tenantGate = resolveIngestTenantId(req);
  if (tenantGate instanceof NextResponse) return tenantGate;
  const tenantId = tenantGate;

  const parsed = await readOtlpHttpBody(req, "logs");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const rows = otlpJsonToLogRows(parsed.data).map((r) => ({
    ...r,
    tenantId,
  }));
  if (rows.length > OTLP_MAX_LOGS) {
    return NextResponse.json(
      { error: `Too many log records in one request (max ${OTLP_MAX_LOGS})` },
      { status: 413 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({});
  }

  await insertLogEntries(rows);
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json({});
}
