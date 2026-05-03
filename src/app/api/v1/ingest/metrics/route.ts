import { insertMetricPoints } from "@/db/client";
import { ingestRejectOversizedBuffer } from "@/lib/ingest-body-limit";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { serviceFromLabels } from "@/lib/service";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  metrics: z.array(
    z.object({
      name: z.string().min(1),
      value: z.number().finite(),
      timestamp: z.number().int().positive().optional(),
      labels: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const gated = ingestPreReadGuards(req, "json");
  if (gated) return gated;

  const tenantGate = resolveIngestTenantId(req);
  if (tenantGate instanceof NextResponse) return tenantGate;
  const tenantId = tenantGate;

  const raw = Buffer.from(await req.arrayBuffer());
  const tooBig = ingestRejectOversizedBuffer(raw, "json");
  if (tooBig) return tooBig;

  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const now = Date.now();
  const rows = parsed.data.metrics.map((m) => {
    const labels = m.labels ?? {};
    const service = serviceFromLabels(labels);
    return {
      tenantId,
      ts: m.timestamp ?? now,
      name: m.name,
      value: m.value,
      service,
      labelsJson: JSON.stringify(labels),
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  await insertMetricPoints(rows);
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json({ accepted: rows.length });
}
