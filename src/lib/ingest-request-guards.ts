import {
  type IngestBodyKind,
  ingestRejectOversizedContentLength,
} from "@/lib/ingest-body-limit";
import {
  ingestClientKeyFromRequest,
  ingestRateLimitExceeded,
} from "@/lib/ingest-rate-limit";
import { NextResponse } from "next/server";

/** Shared pre-read checks: rate limit + Content-Length cap. */
export function ingestPreReadGuards(
  req: Request,
  kind: IngestBodyKind,
): NextResponse | null {
  const key = ingestClientKeyFromRequest(req);
  if (ingestRateLimitExceeded(key)) {
    return NextResponse.json(
      { error: "Too many ingest requests from this client; retry shortly." },
      { status: 429 },
    );
  }
  return ingestRejectOversizedContentLength(req, kind);
}
