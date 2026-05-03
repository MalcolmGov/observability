import { gunzipSync } from "node:zlib";
import { ingestMaxBodyBytes } from "@/lib/ingest-body-limit";
import {
  decodeOtlpProtobuf,
  type OtlpPayloadKind,
} from "@/lib/otlp/otlp-protobuf";

export type OtlpReadResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string };

function contentTypeIsProtobuf(ct: string): boolean {
  const c = ct.toLowerCase();
  return (
    c.includes("application/x-protobuf") ||
    c.includes("application/protobuf")
  );
}

/**
 * OTLP/HTTP: JSON or Protobuf (`Export*ServiceRequest`), optional gzip.
 * Accepts `application/octet-stream` as protobuf (common collector default).
 * If JSON parsing fails, tries protobuf once (binary payloads mislabeled as JSON).
 */
export async function readOtlpHttpBody(
  req: Request,
  kind: OtlpPayloadKind,
): Promise<OtlpReadResult> {
  const encoding = req.headers.get("content-encoding")?.toLowerCase() ?? "";
  let buf = Buffer.from(await req.arrayBuffer());
  if (encoding.includes("gzip")) {
    try {
      buf = gunzipSync(buf);
    } catch {
      return { ok: false, status: 400, error: "Invalid gzip payload" };
    }
  }

  const max = ingestMaxBodyBytes("otlp");
  if (buf.length > max) {
    return {
      ok: false,
      status: 413,
      error: `Payload too large (${buf.length} bytes). Limit ${max} bytes.`,
    };
  }

  const ct = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentTypeIsProtobuf(ct)) {
    try {
      const data = decodeOtlpProtobuf(buf, kind);
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        status: 400,
        error: "Invalid OTLP protobuf body",
      };
    }
  }

  if (ct.includes("application/octet-stream")) {
    try {
      const data = decodeOtlpProtobuf(buf, kind);
      return { ok: true, data };
    } catch {
      /* fall through — some agents send JSON as octet-stream */
    }
  }

  try {
    const text = buf.toString("utf8");
    const data = JSON.parse(text) as unknown;
    return { ok: true, data };
  } catch {
    try {
      const data = decodeOtlpProtobuf(buf, kind);
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        status: 400,
        error:
          "Invalid OTLP body (expected JSON or protobuf Export*ServiceRequest)",
      };
    }
  }
}
