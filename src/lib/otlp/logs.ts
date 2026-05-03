import {
  extractResourceIdentity,
  attrsToStringMap,
  anyValueToJson,
  keyValueListToRecord,
  telemetryDims,
  type TelemetryIdentityCols,
} from "@/lib/otlp/attributes";
import { unixNanoToMs } from "@/lib/otlp/time";
import { serviceFromLabels } from "@/lib/service";

export type OtlpLogInsertRow = {
  ts: number;
  level: string;
  message: string;
  service: string;
  attributesJson: string;
} & TelemetryIdentityCols;

function severityToLevel(
  num: unknown,
  text: unknown,
): string {
  if (typeof text === "string" && text.trim()) return text.trim().toLowerCase();
  const n =
    typeof num === "number"
      ? num
      : typeof num === "string"
        ? Number(num)
        : undefined;
  if (n == null || !Number.isFinite(n)) return "info";
  if (n <= 4) return "trace";
  if (n <= 8) return "debug";
  if (n <= 12) return "info";
  if (n <= 16) return "warn";
  if (n <= 20) return "error";
  return "fatal";
}

function bodyToMessage(body: unknown): string {
  if (body === null || body === undefined) return "";
  const j = anyValueToJson(body);
  if (typeof j === "string") return j;
  try {
    return JSON.stringify(j);
  } catch {
    return String(j);
  }
}

/** OTLP JSON ExportLogsServiceRequest → DB log_entries rows */
export function otlpJsonToLogRows(payload: unknown): OtlpLogInsertRow[] {
  if (!payload || typeof payload !== "object") return [];
  const resourceLogs = (payload as { resourceLogs?: unknown }).resourceLogs;
  if (!Array.isArray(resourceLogs)) return [];

  const now = Date.now();
  const rows: OtlpLogInsertRow[] = [];

  for (const rl of resourceLogs) {
    if (!rl || typeof rl !== "object") continue;
    const resource = (rl as { resource?: { attributes?: unknown } }).resource;
    const resourceAttrs = keyValueListToRecord(resource?.attributes);

    const scopeLogs = (rl as { scopeLogs?: unknown }).scopeLogs;
    if (!Array.isArray(scopeLogs)) continue;

    for (const sl of scopeLogs) {
      if (!sl || typeof sl !== "object") continue;
      const logRecords = (sl as { logRecords?: unknown }).logRecords;
      if (!Array.isArray(logRecords)) continue;

      for (const lr of logRecords) {
        if (!lr || typeof lr !== "object") continue;
        const rec = lr as Record<string, unknown>;

        const attrs = keyValueListToRecord(rec.attributes);
        const merged = { ...resourceAttrs, ...attrs };
        const rid = extractResourceIdentity(merged);
        const labelMap = attrsToStringMap(merged);
        const service = serviceFromLabels(labelMap);

        const ts =
          unixNanoToMs(rec.timeUnixNano as string | number | undefined) ?? now;
        const level = severityToLevel(
          rec.severityNumber,
          rec.severityText,
        );
        const message = bodyToMessage(rec.body);

        rows.push({
          ts,
          level,
          message: message || "(empty)",
          service,
          attributesJson: JSON.stringify(merged),
          ...telemetryDims(rid),
        });
      }
    }
  }

  return rows;
}
