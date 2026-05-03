import { NextResponse } from "next/server";

function maxOtlpBytes(): number {
  const n = Number(process.env.PULSE_INGEST_MAX_BODY_BYTES);
  return Number.isFinite(n) && n >= 65_536 ? Math.min(n, 64 * 1024 * 1024) : 8 * 1024 * 1024;
}

function maxPrometheusBytes(): number {
  const n = Number(process.env.PULSE_INGEST_PROMETHEUS_MAX_BODY_BYTES);
  return Number.isFinite(n) && n >= 16_384 ? Math.min(n, 32 * 1024 * 1024) : 4 * 1024 * 1024;
}

function maxJsonIngestBytes(): number {
  const n = Number(process.env.PULSE_INGEST_JSON_MAX_BODY_BYTES);
  return Number.isFinite(n) && n >= 16_384 ? Math.min(n, 16 * 1024 * 1024) : 4 * 1024 * 1024;
}

export type IngestBodyKind = "otlp" | "prometheus" | "json";

export function ingestMaxBodyBytes(kind: IngestBodyKind): number {
  switch (kind) {
    case "otlp":
      return maxOtlpBytes();
    case "prometheus":
      return maxPrometheusBytes();
    case "json":
      return maxJsonIngestBytes();
    default:
      return maxJsonIngestBytes();
  }
}

/** Reject oversized bodies before buffering full payload where Content-Length is trustworthy. */
export function ingestRejectOversizedContentLength(
  req: Request,
  kind: IngestBodyKind,
): NextResponse | null {
  const raw = req.headers.get("content-length")?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const max = ingestMaxBodyBytes(kind);
  if (n > max) {
    return NextResponse.json(
      {
        error: `Payload too large (${n} bytes). Limit ${max} bytes for ${kind} ingest.`,
        limitBytes: max,
      },
      { status: 413 },
    );
  }
  return null;
}

export function ingestRejectOversizedBuffer(
  buf: Buffer,
  kind: IngestBodyKind,
): NextResponse | null {
  const max = ingestMaxBodyBytes(kind);
  if (buf.length > max) {
    return NextResponse.json(
      {
        error: `Payload too large (${buf.length} bytes). Limit ${max} bytes.`,
        limitBytes: max,
      },
      { status: 413 },
    );
  }
  return null;
}
