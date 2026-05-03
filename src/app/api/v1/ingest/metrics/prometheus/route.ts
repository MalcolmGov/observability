import { insertMetricPoints } from "@/db/client";
import { ingestRejectOversizedBuffer } from "@/lib/ingest-body-limit";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { parsePrometheusText } from "@/lib/prometheus-text";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * Accepts Prometheus / OpenMetrics text exposition (scrape format).
 * Optional: ?service=my-app adds a default `service` label when missing.
 */
export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const gated = ingestPreReadGuards(req, "prometheus");
  if (gated) return gated;

  const tenantGate = resolveIngestTenantId(req);
  if (tenantGate instanceof NextResponse) return tenantGate;
  const tenantId = tenantGate;

  const { searchParams } = new URL(req.url);
  const defaultSvc = searchParams.get("service")?.trim();
  const defaultLabels: Record<string, string> = defaultSvc
    ? { service: defaultSvc }
    : {};

  const text = await req.text();
  const tooBig = ingestRejectOversizedBuffer(Buffer.from(text, "utf8"), "prometheus");
  if (tooBig) return tooBig;
  if (!text.trim()) {
    return NextResponse.json({ accepted: 0 });
  }

  const parsed = parsePrometheusText(text, defaultLabels);
  if (parsed.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  const rows = parsed.map((m) => ({
    tenantId,
    ts: m.timestamp,
    name: m.name,
    value: m.value,
    service: m.service,
    labelsJson: JSON.stringify(m.labels),
  }));

  await insertMetricPoints(rows);
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json({ accepted: rows.length });
}
