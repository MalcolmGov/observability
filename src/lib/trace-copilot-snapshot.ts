import "server-only";

import { queryAll } from "@/db/client";

export type TraceCopilotSpan = {
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
  attributes: Record<string, unknown>;
  /** First few OTLP span events (name only), for exception/debugging context */
  eventNames?: string[];
  /** Linked traces (target trace id + span id), capped */
  links?: { traceId: string; spanId: string }[];
};

export type TraceCopilotPayload = {
  traceId: string;
  traceDurationMs: number;
  spanCount: number;
  errorSpanCount: number;
  spansTruncated: boolean;
  spans: TraceCopilotSpan[];
};

/** OTLP uses 32-char hex; demo seeds use short alphanumeric IDs — allow both. */
const TRACE_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export function isValidTraceIdForCopilot(id: string): boolean {
  return TRACE_ID_RE.test(id.trim());
}

function slimAttrs(
  attrs: Record<string, unknown>,
  maxKeys = 20,
  maxValLen = 140,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(attrs)) {
    if (n >= maxKeys) break;
    if (v === null || v === undefined) {
      out[k] = v;
    } else if (typeof v === "string") {
      out[k] = v.length <= maxValLen ? v : `${v.slice(0, maxValLen)}…`;
    } else if (
      typeof v === "number" ||
      typeof v === "boolean" ||
      typeof v === "bigint"
    ) {
      out[k] = v;
    } else {
      try {
        const s = JSON.stringify(v);
        out[k] = s.length <= maxValLen ? s : `${s.slice(0, maxValLen)}…`;
      } catch {
        out[k] = "(unserializable)";
      }
    }
    n++;
  }
  return out;
}

function slimLinks(raw: string): { traceId: string; spanId: string }[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    const out: { traceId: string; spanId: string }[] = [];
    for (const item of v.slice(0, 8)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const traceId = typeof o.traceId === "string" ? o.traceId : "";
      const spanId = typeof o.spanId === "string" ? o.spanId : "";
      if (traceId && spanId) out.push({ traceId, spanId });
    }
    return out;
  } catch {
    return [];
  }
}

function slimEventNames(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.slice(0, 8).map((ev) => {
      if (!ev || typeof ev !== "object") return "(event)";
      const n = (ev as { name?: unknown }).name;
      return typeof n === "string" && n.trim() ? n.trim() : "(event)";
    });
  } catch {
    return [];
  }
}

const MAX_SPANS_LLM = 45;

/** Prioritize errors, slow spans, then fill by start time for token limits. */
function pickSpansForModel(spans: TraceCopilotSpan[]): {
  picked: TraceCopilotSpan[];
  truncated: boolean;
} {
  if (spans.length <= MAX_SPANS_LLM) {
    return { picked: spans, truncated: false };
  }
  const byDur = [...spans].sort((a, b) => b.durationMs - a.durationMs);
  const errors = spans.filter((s) => s.status === "error");
  const seen = new Set<string>();
  const picked: TraceCopilotSpan[] = [];
  function add(s: TraceCopilotSpan) {
    if (picked.length >= MAX_SPANS_LLM) return;
    if (seen.has(s.spanId)) return;
    seen.add(s.spanId);
    picked.push(s);
  }
  for (const s of errors) add(s);
  for (const s of byDur) add(s);
  for (const s of [...spans].sort((a, b) => a.startTs - b.startTs)) add(s);
  picked.sort((a, b) => a.startTs - b.startTs || a.spanId.localeCompare(b.spanId));
  return { picked, truncated: true };
}

export async function loadTraceCopilotPayload(
  traceId: string,
  tenantId: string,
): Promise<TraceCopilotPayload | null> {
  const tid = traceId.trim();
  if (!isValidTraceIdForCopilot(tid)) return null;

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
    eventsJson: string;
    linksJson: string;
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
        attributes_json AS attributesJson,
        events_json AS eventsJson,
        links_json AS linksJson
      FROM trace_spans
      WHERE tenant_id = ? AND trace_id = ?
      ORDER BY start_ts ASC, span_id ASC
    `,
    [tenantId, tid],
  );

  if (!rows.length) return null;

  let attrsParseFail = 0;
  const spansFull: TraceCopilotSpan[] = rows.map((r) => {
    let attrs: Record<string, unknown> = {};
    try {
      attrs = JSON.parse(r.attributesJson || "{}") as Record<string, unknown>;
    } catch {
      attrsParseFail++;
      attrs = { _parse_error: true };
    }
    const names = slimEventNames(r.eventsJson);
    const links = slimLinks(r.linksJson);
    const base: TraceCopilotSpan = {
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
      attributes: slimAttrs(attrs),
    };
    if (names.length) base.eventNames = names;
    if (links.length) base.links = links;
    return base;
  });

  if (attrsParseFail > 0) {
    spansFull[0] = {
      ...spansFull[0],
      attributes: {
        ...spansFull[0].attributes,
        _note: `${attrsParseFail} span(s) had unparsable attributes JSON`,
      },
    };
  }

  const start = Math.min(...spansFull.map((s) => s.startTs));
  const end = Math.max(...spansFull.map((s) => s.endTs));
  const errorSpanCount = spansFull.filter((s) => s.status === "error").length;

  const { picked, truncated } = pickSpansForModel(spansFull);

  return {
    traceId: tid,
    traceDurationMs: Math.max(0, end - start),
    spanCount: spansFull.length,
    errorSpanCount,
    spansTruncated: truncated,
    spans: picked,
  };
}
