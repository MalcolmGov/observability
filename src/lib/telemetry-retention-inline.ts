import "server-only";

import { queryGet, queryRun } from "@/db/query-runtime";
import { runTelemetryRetention } from "@/lib/telemetry-retention";

const KV_KEY = "last_inline_retention_ms";

/** Minimum sensible interval (1 minute). */
const MIN_INTERVAL_MS = 60_000;

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Safety net when external cron fails: run age-based purge occasionally after writes.
 * Uses `_pulse_kv.last_inline_retention_ms`; safe across tenants (retention deletes by time only).
 */
export async function maybeRunTelemetryRetentionAfterWrite(): Promise<void> {
  if (process.env.PULSE_DISABLE_INLINE_RETENTION?.trim() === "1") return;

  const parsed = Number(process.env.PULSE_RETENTION_INLINE_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(parsed) && parsed >= MIN_INTERVAL_MS
      ? parsed
      : DEFAULT_INTERVAL_MS;

  const now = Date.now();
  const row = await queryGet<{ value: string }>(
    `SELECT value FROM _pulse_kv WHERE key = ?`,
    [KV_KEY],
  );
  const last = row?.value ? Number(row.value) : 0;
  if (Number.isFinite(last) && now - last < intervalMs) return;

  await runTelemetryRetention(now);

  await queryRun(
    `INSERT INTO _pulse_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [KV_KEY, String(now)],
  );
}
