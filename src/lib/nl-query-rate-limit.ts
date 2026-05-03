const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const buckets = new Map<string, number[]>();

/**
 * Returns true if this client should be blocked (sliding window).
 * Best-effort only on multi-instance deploys (each instance has its own map).
 */
export function nlQueryRateLimitExceeded(clientId: string): boolean {
  const now = Date.now();
  const prev = buckets.get(clientId) ?? [];
  const recent = prev.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(clientId, recent);
    return true;
  }
  recent.push(now);
  buckets.set(clientId, recent);
  return false;
}
