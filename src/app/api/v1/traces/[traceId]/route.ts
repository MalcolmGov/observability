import { queryAll } from "@/db/client";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ traceId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { traceId } = await params;
  if (!traceId) {
    return NextResponse.json({ error: "traceId required" }, { status: 400 });
  }

  const rows = await queryAll<{
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    service: string;
    name: string;
    startTs: number;
    endTs: number;
    durationMs: number;
    kind: string;
    status: string;
    peerService: string | null;
    attributesJson: string;
  }>(
    `
      SELECT
        trace_id AS traceId,
        span_id AS spanId,
        parent_span_id AS parentSpanId,
        service,
        name,
        start_ts AS startTs,
        end_ts AS endTs,
        duration_ms AS durationMs,
        kind,
        status,
        peer_service AS peerService,
        attributes_json AS attributesJson
      FROM trace_spans
      WHERE trace_id = ?
      ORDER BY start_ts ASC, span_id ASC
    `,
    [traceId],
  );

  if (!rows.length) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 });
  }

  const spans = rows.map((r) => ({
    traceId: r.traceId,
    spanId: r.spanId,
    parentSpanId: r.parentSpanId,
    service: r.service,
    name: r.name,
    startTs: Number(r.startTs),
    endTs: Number(r.endTs),
    durationMs: Number(r.durationMs),
    kind: r.kind,
    status: r.status,
    peerService: r.peerService,
    attributes: JSON.parse(r.attributesJson || "{}") as Record<
      string,
      unknown
    >,
  }));

  const start = Math.min(...spans.map((s) => s.startTs));
  const end = Math.max(...spans.map((s) => s.endTs));

  return NextResponse.json({
    traceId,
    startTs: start,
    endTs: end,
    durationMs: end - start,
    spans,
  });
}
