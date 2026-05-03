import { queryRun } from "@/db/query-runtime";

function daysToMs(days: number): number {
  if (!Number.isFinite(days) || days < 1) return 14 * 86_400_000;
  return days * 86_400_000;
}

function parseDays(envVal: string | undefined, fallback: number): number {
  const n = Number(envVal);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function retentionConfig() {
  const metricsDays = parseDays(
    process.env.PULSE_RETENTION_METRICS_DAYS,
    14,
  );
  const logsDays = parseDays(process.env.PULSE_RETENTION_LOGS_DAYS, 14);
  const tracesDays = parseDays(process.env.PULSE_RETENTION_TRACES_DAYS, 7);
  return { metricsDays, logsDays, tracesDays };
}

export async function runTelemetryRetention(nowMs = Date.now()) {
  const { metricsDays, logsDays, tracesDays } = retentionConfig();
  const metricsCut = nowMs - daysToMs(metricsDays);
  const logsCut = nowMs - daysToMs(logsDays);
  const tracesCut = nowMs - daysToMs(tracesDays);

  const delMetrics = await queryRun(`DELETE FROM metric_points WHERE ts < ?`, [
    metricsCut,
  ]);
  const delLogs = await queryRun(`DELETE FROM log_entries WHERE ts < ?`, [
    logsCut,
  ]);
  const delSpans = await queryRun(
    `DELETE FROM trace_spans WHERE start_ts < ?`,
    [tracesCut],
  );

  return {
    cutoffsMs: {
      metrics: metricsCut,
      logs: logsCut,
      traces: tracesCut,
    },
    deleted: {
      metricPoints: delMetrics,
      logEntries: delLogs,
      traceSpans: delSpans,
    },
    config: { metricsDays, logsDays, tracesDays },
  };
}
