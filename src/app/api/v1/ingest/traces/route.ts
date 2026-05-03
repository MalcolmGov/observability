import { insertTraceSpans } from "@/db/client";
import { ingestRejectOversizedBuffer } from "@/lib/ingest-body-limit";
import { ingestPreReadGuards } from "@/lib/ingest-request-guards";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { resolveIngestTenantId } from "@/lib/telemetry-tenant";
import { maybeRunTelemetryRetentionAfterWrite } from "@/lib/telemetry-retention-inline";
import { NextResponse } from "next/server";
import { z } from "zod";

const spanSchema = z.object({
  trace_id: z.string().min(1),
  span_id: z.string().min(1),
  parent_span_id: z.string().optional().nullable(),
  service: z.string().min(1),
  name: z.string().min(1),
  start_ts: z.number().int(),
  end_ts: z.number().int().optional(),
  duration_ms: z.number().optional(),
  kind: z.enum(["internal", "client", "server", "producer", "consumer"]).optional(),
  status: z.enum(["ok", "error"]).optional(),
  peer_service: z.string().optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  events: z.array(z.unknown()).optional(),
  links: z.array(z.unknown()).optional(),
  product: z.string().optional(),
  market: z.string().optional(),
  environment: z.string().optional(),
  version: z.string().optional().nullable(),
  instance_id: z.string().optional().nullable(),
});

const bodySchema = z.object({
  spans: z.array(spanSchema),
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

  const rows = parsed.data.spans.map((s) => {
    const start = s.start_ts;
    const end = s.end_ts ?? start + Math.max(1, s.duration_ms ?? 1);
    const duration =
      s.duration_ms ??
      (() => {
        const d = end - start;
        return d > 0 ? d : 1;
      })();

    return {
      tenantId,
      traceId: s.trace_id,
      spanId: s.span_id,
      parentSpanId: s.parent_span_id ?? null,
      service: s.service,
      name: s.name,
      startTs: start,
      endTs: end,
      durationMs: duration,
      kind: s.kind ?? "internal",
      status: s.status ?? "ok",
      peerService: s.peer_service ?? null,
      attributesJson: JSON.stringify(s.attributes ?? {}),
      eventsJson: JSON.stringify(s.events ?? []),
      linksJson: JSON.stringify(s.links ?? []),
      product: s.product,
      market: s.market,
      environment: s.environment,
      version: s.version ?? undefined,
      instanceId: s.instance_id ?? undefined,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  await insertTraceSpans(rows);
  await maybeRunTelemetryRetentionAfterWrite();

  return NextResponse.json({ accepted: rows.length });
}
