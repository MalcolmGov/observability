import { insertTraceSpans } from "@/db/client";
import { requireIngestAuth } from "@/lib/ingest-auth";
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
});

const bodySchema = z.object({
  spans: z.array(spanSchema),
});

export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  let json: unknown;
  try {
    json = await req.json();
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
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  await insertTraceSpans(rows);

  return NextResponse.json({ accepted: rows.length });
}
