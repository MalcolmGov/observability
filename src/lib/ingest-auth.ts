import { NextResponse } from "next/server";

/**
 * When PULSE_INGEST_API_KEY is set, ingest routes require either:
 * - Authorization: Bearer <key>
 * - X-Pulse-Ingest-Key: <key>
 */
export function requireIngestAuth(req: Request): NextResponse | null {
  const key = process.env.PULSE_INGEST_API_KEY?.trim();
  if (!key) return null;

  const bearer = req.headers.get("authorization");
  const header = req.headers.get("x-pulse-ingest-key");
  const ok =
    bearer === `Bearer ${key}` || (header != null && header === key);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function isIngestAuthConfigured(): boolean {
  return Boolean(process.env.PULSE_INGEST_API_KEY?.trim());
}
