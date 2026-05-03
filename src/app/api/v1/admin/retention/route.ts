import { requireCronSecret } from "@/lib/cron-auth";
import {
  retentionConfig,
  runTelemetryRetention,
} from "@/lib/telemetry-retention";
import { NextResponse } from "next/server";

/**
 * Deletes telemetry older than PULSE_RETENTION_*_DAYS thresholds.
 * Production: requires Authorization: Bearer PULSE_CRON_SECRET
 */
export async function POST(req: Request) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const result = await runTelemetryRetention();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    configured: retentionConfig(),
    note: "POST runs the purge using these day thresholds.",
  });
}
