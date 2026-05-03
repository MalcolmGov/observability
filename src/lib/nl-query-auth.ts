import { NextResponse } from "next/server";

/**
 * When PULSE_NL_QUERY_API_KEY is set, POST /api/v1/query/nl requires either:
 * - Authorization: Bearer <key>
 * - X-Pulse-Nl-Query-Key: <key>
 *
 * Server actions are not gated by this key (browser UX); use rate limits instead.
 */
export function requireNlQueryApiAuth(req: Request): NextResponse | null {
  const key = process.env.PULSE_NL_QUERY_API_KEY?.trim();
  if (!key) return null;

  const bearer = req.headers.get("authorization");
  const header = req.headers.get("x-pulse-nl-query-key");
  const ok =
    bearer === `Bearer ${key}` || (header != null && header === key);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function isNlQueryApiAuthConfigured(): boolean {
  return Boolean(process.env.PULSE_NL_QUERY_API_KEY?.trim());
}
