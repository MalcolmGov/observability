/**
 * Best-effort sliding-window rate limit for ingest HTTP endpoints (per-instance).
 * Key is typically client IP from X-Forwarded-For / CF-Connecting-IP / fallback "direct".
 */

const WINDOW_MS = 60_000;

function maxIngestPerWindow(): number {
  const n = Number(process.env.PULSE_INGEST_MAX_REQ_PER_MINUTE);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50_000) : 600;
}

const buckets = new Map<string, number[]>();

export function ingestClientKeyFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.trim();
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return `ip:${cf}`;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;
  return "ip:unknown";
}

/** Returns true when this key exceeded its ingest budget for the current window. */
export function ingestRateLimitExceeded(clientKey: string): boolean {
  if (process.env.PULSE_DISABLE_INGEST_RATE_LIMIT?.trim() === "1") {
    return false;
  }
  const max = maxIngestPerWindow();
  const now = Date.now();
  const prev = buckets.get(clientKey) ?? [];
  const recent = prev.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    buckets.set(clientKey, recent);
    return true;
  }
  recent.push(now);
  buckets.set(clientKey, recent);
  return false;
}
