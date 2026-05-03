import { NextResponse } from "next/server";

/**
 * When PULSE_INGEST_API_KEY is set, ingest routes require either:
 * - Authorization: Bearer <key>
 * - X-Pulse-Ingest-Key: <key>
 *
 * Tenant isolation: send `x-pulse-tenant-id` on ingest when using SaaS mode
 * (`PULSE_MULTI_TENANT=1`). UI reads the same tenant via cookie `pulse_tenant_id`
 * or that header on API requests.
 *
 * Applies to JSON ingest routes and OTLP/HTTP (`/api/v1/ingest/otlp/v1/*`).
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
