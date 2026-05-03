import { queryRun } from "@/db/query-runtime";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  olderThanDays: z.number().min(1).max(365),
});

/** Deletes old telemetry. Gated in production. */
export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DATA_PURGE !== "1"
  ) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const cutoff = Date.now() - parsed.data.olderThanDays * 24 * 60 * 60 * 1000;

  const delMetrics = await queryRun(`DELETE FROM metric_points WHERE ts < ?`, [
    cutoff,
  ]);
  const delLogs = await queryRun(`DELETE FROM log_entries WHERE ts < ?`, [
    cutoff,
  ]);
  const delSpans = await queryRun(
    `DELETE FROM trace_spans WHERE start_ts < ?`,
    [cutoff],
  );

  return NextResponse.json({
    ok: true,
    cutoffMs: cutoff,
    deleted: {
      metricPoints: delMetrics,
      logEntries: delLogs,
      traceSpans: delSpans,
    },
  });
}
