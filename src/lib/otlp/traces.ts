import {
  extractResourceIdentity,
  keyValueListToRecord,
  telemetryDims,
  type TelemetryIdentityCols,
} from "@/lib/otlp/attributes";
import { otlpSpanIdToHex, otlpTraceIdToHex } from "@/lib/otlp/ids";
import { unixNanoToMs } from "@/lib/otlp/time";

const KIND_MAP: Record<string, string> = {
  SPAN_KIND_UNSPECIFIED: "internal",
  SPAN_KIND_INTERNAL: "internal",
  SPAN_KIND_SERVER: "server",
  SPAN_KIND_CLIENT: "client",
  SPAN_KIND_PRODUCER: "producer",
  SPAN_KIND_CONSUMER: "consumer",
};

function mapKind(raw: unknown): string {
  if (typeof raw !== "string") return "internal";
  return KIND_MAP[raw] ?? "internal";
}

function mapStatus(code: unknown): "ok" | "error" {
  return code === "STATUS_CODE_ERROR" ? "error" : "ok";
}

function peerFromAttrs(attrs: Record<string, unknown>): string | null {
  const peer =
    attrs["peer.service"] ??
    attrs["net.peer.name"] ??
    attrs["server.address"];
  if (typeof peer === "string" && peer.trim()) return peer.trim();
  return null;
}

function serializeSpanEvents(raw: unknown): string {
  if (!Array.isArray(raw)) return "[]";
  const out: Record<string, unknown>[] = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== "object") continue;
    const e = ev as Record<string, unknown>;
    const attrs = keyValueListToRecord(e.attributes);
    out.push({
      name: typeof e.name === "string" ? e.name : "",
      timeUnixNano: e.timeUnixNano ?? null,
      droppedAttributesCount: e.droppedAttributesCount ?? undefined,
      attributes: attrs,
    });
  }
  return JSON.stringify(out);
}

function serializeSpanLinks(raw: unknown): string {
  if (!Array.isArray(raw)) return "[]";
  const out: Record<string, unknown>[] = [];
  for (const lk of raw) {
    if (!lk || typeof lk !== "object") continue;
    const L = lk as Record<string, unknown>;
    const traceHex = otlpTraceIdToHex(L.traceId as string | undefined);
    const spanHex = otlpSpanIdToHex(L.spanId as string | undefined);
    const attrs = keyValueListToRecord(L.attributes);
    out.push({
      traceId: traceHex,
      spanId: spanHex,
      traceState: typeof L.traceState === "string" ? L.traceState : undefined,
      droppedAttributesCount: L.droppedAttributesCount ?? undefined,
      attributes: attrs,
    });
  }
  return JSON.stringify(out);
}

export type OtlpTraceInsertRow = {
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
} & TelemetryIdentityCols;

/** OTLP JSON ExportTraceServiceRequest → DB rows */
export function otlpJsonToTraceRows(payload: unknown): OtlpTraceInsertRow[] {
  if (!payload || typeof payload !== "object") return [];
  const resourceSpans = (payload as { resourceSpans?: unknown }).resourceSpans;
  if (!Array.isArray(resourceSpans)) return [];

  const rows: OtlpTraceInsertRow[] = [];

  for (const rs of resourceSpans) {
    if (!rs || typeof rs !== "object") continue;
    const resource = (rs as { resource?: { attributes?: unknown } }).resource;
    const resourceAttrs = keyValueListToRecord(resource?.attributes);

    const scopeSpans = (rs as { scopeSpans?: unknown }).scopeSpans;
    if (!Array.isArray(scopeSpans)) continue;

    for (const ss of scopeSpans) {
      if (!ss || typeof ss !== "object") continue;
      const spans = (ss as { spans?: unknown }).spans;
      if (!Array.isArray(spans)) continue;

      for (const span of spans) {
        if (!span || typeof span !== "object") continue;
        const s = span as Record<string, unknown>;

        const traceHex = otlpTraceIdToHex(s.traceId as string | undefined);
        const spanHex = otlpSpanIdToHex(s.spanId as string | undefined);
        if (!traceHex || !spanHex) continue;

        const parentRaw = s.parentSpanId as string | undefined;
        const parentHex =
          parentRaw && parentRaw !== ""
            ? otlpSpanIdToHex(parentRaw)
            : null;

        const startMs = unixNanoToMs(
          s.startTimeUnixNano as string | number | undefined,
        );
        const endMs = unixNanoToMs(
          s.endTimeUnixNano as string | number | undefined,
        );
        if (startMs == null) continue;
        const end = endMs != null && endMs >= startMs ? endMs : startMs + 1;
        const durationMs = Math.max(1, end - startMs);

        const spanAttrs = keyValueListToRecord(s.attributes);
        const mergedAttrs = { ...resourceAttrs, ...spanAttrs };
        const rid = extractResourceIdentity(mergedAttrs);
        const service = rid.service;

        const statusObj = s.status as { code?: unknown } | undefined;
        const status = mapStatus(statusObj?.code);

        rows.push({
          traceId: traceHex,
          spanId: spanHex,
          parentSpanId: parentHex,
          service,
          name: typeof s.name === "string" && s.name ? s.name : "(unknown)",
          startTs: startMs,
          endTs: end,
          durationMs,
          kind: mapKind(s.kind),
          status,
          peerService: peerFromAttrs(spanAttrs),
          attributesJson: JSON.stringify(mergedAttrs),
          eventsJson: serializeSpanEvents(s.events),
          linksJson: serializeSpanLinks(s.links),
          ...telemetryDims(rid),
        });
      }
    }
  }

  return rows;
}
