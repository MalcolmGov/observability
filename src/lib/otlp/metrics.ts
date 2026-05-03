import {
  attrsToStringMap,
  extractResourceIdentity,
  keyValueListToRecord,
  telemetryDims,
  type TelemetryIdentityCols,
} from "@/lib/otlp/attributes";
import { unixNanoToMs } from "@/lib/otlp/time";
import { serviceFromLabels } from "@/lib/service";

export type OtlpMetricInsertRow = {
  ts: number;
  name: string;
  value: number;
  service: string;
  labelsJson: string;
} & TelemetryIdentityCols;

export type OtlpMetricParseResult = {
  rows: OtlpMetricInsertRow[];
  /** Human-readable ingest caveats (unsupported structures, partial exports). */
  notices: string[];
};

function pushGaugeOrSumPoints(
  dataPoints: unknown[] | undefined,
  metricName: string,
  resourceAttrs: Record<string, unknown>,
  now: number,
  rows: OtlpMetricInsertRow[],
  dims: TelemetryIdentityCols,
): void {
  if (!Array.isArray(dataPoints)) return;
  for (const dp of dataPoints) {
    if (!dp || typeof dp !== "object") continue;
    const o = dp as Record<string, unknown>;
    const attrs = keyValueListToRecord(o.attributes);
    const merged = { ...resourceAttrs, ...attrs };
    const labelMap = attrsToStringMap(merged);
    const ts =
      unixNanoToMs(o.timeUnixNano as string | number | undefined) ?? now;

    let value: number | undefined;
    if (typeof o.asDouble === "number" && Number.isFinite(o.asDouble)) {
      value = o.asDouble;
    } else if (o.asInt !== undefined && o.asInt !== null) {
      const n = Number(o.asInt);
      if (Number.isFinite(n)) value = n;
    }
    if (value === undefined) continue;

    rows.push({
      ts,
      name: metricName,
      value,
      service: serviceFromLabels(labelMap),
      labelsJson: JSON.stringify(labelMap),
      ...dims,
    });
  }
}

function pushHistogramPoints(
  dataPoints: unknown[] | undefined,
  metricName: string,
  resourceAttrs: Record<string, unknown>,
  now: number,
  rows: OtlpMetricInsertRow[],
  notices: string[],
  dims: TelemetryIdentityCols,
): void {
  if (!Array.isArray(dataPoints)) return;
  for (const dp of dataPoints) {
    if (!dp || typeof dp !== "object") continue;
    const o = dp as Record<string, unknown>;
    const attrs = keyValueListToRecord(o.attributes);
    const merged = { ...resourceAttrs, ...attrs };
    const labelMap = attrsToStringMap(merged);
    const ts =
      unixNanoToMs(o.timeUnixNano as string | number | undefined) ?? now;
    const service = serviceFromLabels(labelMap);

    if (typeof o.sum === "number" && Number.isFinite(o.sum)) {
      rows.push({
        ts,
        name: `${metricName}_sum`,
        value: o.sum,
        service,
        labelsJson: JSON.stringify(labelMap),
        ...dims,
      });
    }
    if (o.count !== undefined && o.count !== null) {
      const c = Number(o.count);
      if (Number.isFinite(c)) {
        rows.push({
          ts,
          name: `${metricName}_count`,
          value: c,
          service,
          labelsJson: JSON.stringify(labelMap),
          ...dims,
        });
      }
    }

    const boundsRaw = o.explicitBounds as unknown;
    const countsRaw = o.bucketCounts as unknown;
    if (Array.isArray(countsRaw) && countsRaw.length > 0) {
      if (!Array.isArray(boundsRaw)) {
        notices.push(
          `histogram "${metricName}": bucket_counts present without explicitBounds — emitting sum/count only`,
        );
      } else {
        let cumulative = 0;
        for (let i = 0; i < countsRaw.length; i++) {
          const add = Number(countsRaw[i]);
          if (!Number.isFinite(add)) continue;
          cumulative += add;
          const le =
            i < boundsRaw.length && boundsRaw[i] !== undefined
              ? Number(boundsRaw[i])
              : Number.POSITIVE_INFINITY;
          const lm = {
            ...labelMap,
            le: Number.isFinite(le) ? String(le) : "+Inf",
          };
          rows.push({
            ts,
            name: `${metricName}_bucket`,
            value: cumulative,
            service,
            labelsJson: JSON.stringify(lm),
            ...dims,
          });
        }
      }
    }
  }
}

function pushSummaryPoints(
  dataPoints: unknown[] | undefined,
  metricName: string,
  resourceAttrs: Record<string, unknown>,
  now: number,
  rows: OtlpMetricInsertRow[],
  dims: TelemetryIdentityCols,
): void {
  if (!Array.isArray(dataPoints)) return;
  for (const dp of dataPoints) {
    if (!dp || typeof dp !== "object") continue;
    const o = dp as Record<string, unknown>;
    const attrs = keyValueListToRecord(o.attributes);
    const merged = { ...resourceAttrs, ...attrs };
    const labelMap = attrsToStringMap(merged);
    const ts =
      unixNanoToMs(o.timeUnixNano as string | number | undefined) ?? now;
    const service = serviceFromLabels(labelMap);
    const baseLabels = JSON.stringify(labelMap);

    if (o.count !== undefined && o.count !== null) {
      const c = Number(o.count);
      if (Number.isFinite(c)) {
        rows.push({
          ts,
          name: `${metricName}_count`,
          value: c,
          service,
          labelsJson: baseLabels,
          ...dims,
        });
      }
    }
    if (typeof o.sum === "number" && Number.isFinite(o.sum)) {
      rows.push({
        ts,
        name: `${metricName}_sum`,
        value: o.sum,
        service,
        labelsJson: baseLabels,
        ...dims,
      });
    }

    const qv = o.quantileValues as unknown;
    if (!Array.isArray(qv)) continue;
    for (const q of qv) {
      if (!q || typeof q !== "object") continue;
      const qo = q as Record<string, unknown>;
      const quantile =
        typeof qo.quantile === "number"
          ? qo.quantile
          : Number(qo.quantile ?? NaN);
      const val =
        typeof qo.value === "number"
          ? qo.value
          : Number(qo.value ?? NaN);
      if (!Number.isFinite(quantile) || !Number.isFinite(val)) continue;
      const lm = {
        ...labelMap,
        quantile: String(quantile),
      };
      rows.push({
        ts,
        name: metricName,
        value: val,
        service,
        labelsJson: JSON.stringify(lm),
        ...dims,
      });
    }
  }
}

function sumNumericArray(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  let s = 0;
  for (const x of raw) {
    const n = Number(x);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

function pushExponentialHistogramPoints(
  dataPoints: unknown[] | undefined,
  metricName: string,
  resourceAttrs: Record<string, unknown>,
  now: number,
  rows: OtlpMetricInsertRow[],
  notices: string[],
  dims: TelemetryIdentityCols,
): void {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) return;
  notices.push(
    `exponentialHistogram "${metricName}": exporting sum/count/zero_count and summed bucket observation counts — OTLP bucket reconstruction not implemented`,
  );
  for (const dp of dataPoints) {
    if (!dp || typeof dp !== "object") continue;
    const o = dp as Record<string, unknown>;
    const attrs = keyValueListToRecord(o.attributes);
    const merged = { ...resourceAttrs, ...attrs };
    const labelMap = attrsToStringMap(merged);
    const ts =
      unixNanoToMs(o.timeUnixNano as string | number | undefined) ?? now;
    const service = serviceFromLabels(labelMap);
    const baseJson = JSON.stringify(labelMap);

    if (typeof o.sum === "number" && Number.isFinite(o.sum)) {
      rows.push({
        ts,
        name: `${metricName}_exp_hist_sum`,
        value: o.sum,
        service,
        labelsJson: baseJson,
        ...dims,
      });
    }
    if (o.count !== undefined && o.count !== null) {
      const c = Number(o.count);
      if (Number.isFinite(c)) {
        rows.push({
          ts,
          name: `${metricName}_exp_hist_count`,
          value: c,
          service,
          labelsJson: baseJson,
          ...dims,
        });
      }
    }
    if (o.zeroCount !== undefined && o.zeroCount !== null) {
      const z = Number(o.zeroCount);
      if (Number.isFinite(z)) {
        rows.push({
          ts,
          name: `${metricName}_exp_hist_zero_count`,
          value: z,
          service,
          labelsJson: baseJson,
          ...dims,
        });
      }
    }

    const pos = o.positive as Record<string, unknown> | undefined;
    const neg = o.negative as Record<string, unknown> | undefined;
    const posCounts = pos?.bucketCounts;
    const negCounts = neg?.bucketCounts;
    const posSum = sumNumericArray(posCounts);
    const negSum = sumNumericArray(negCounts);
    if (posSum > 0 || negSum > 0) {
      rows.push({
        ts,
        name: `${metricName}_exp_hist_bucket_observations`,
        value: posSum + negSum,
        service,
        labelsJson: JSON.stringify({
          ...labelMap,
          pole: "combined_positive_negative_counts",
        }),
        ...dims,
      });
    }
  }
}

/** OTLP JSON ExportMetricsServiceRequest → DB metric_points rows */
export function otlpJsonToMetricRows(payload: unknown): OtlpMetricParseResult {
  const notices: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { rows: [], notices };
  }
  const resourceMetrics = (payload as { resourceMetrics?: unknown })
    .resourceMetrics;
  if (!Array.isArray(resourceMetrics)) {
    return { rows: [], notices };
  }

  const now = Date.now();
  const rows: OtlpMetricInsertRow[] = [];

  for (const rm of resourceMetrics) {
    if (!rm || typeof rm !== "object") continue;
    const resource = (rm as { resource?: { attributes?: unknown } }).resource;
    const resourceAttrs = keyValueListToRecord(resource?.attributes);
    const dims = telemetryDims(extractResourceIdentity(resourceAttrs));

    const scopeMetrics = (rm as { scopeMetrics?: unknown }).scopeMetrics;
    if (!Array.isArray(scopeMetrics)) continue;

    for (const sm of scopeMetrics) {
      if (!sm || typeof sm !== "object") continue;
      const metrics = (sm as { metrics?: unknown }).metrics;
      if (!Array.isArray(metrics)) continue;

      for (const m of metrics) {
        if (!m || typeof m !== "object") continue;
        const metric = m as Record<string, unknown>;
        const name = metric.name;
        if (typeof name !== "string" || !name) continue;

        const gauge = metric.gauge as { dataPoints?: unknown[] } | undefined;
        const sum = metric.sum as { dataPoints?: unknown[] } | undefined;
        const histogram = metric.histogram as {
          dataPoints?: unknown[];
        } | undefined;
        const summary = metric.summary as {
          dataPoints?: unknown[];
        } | undefined;
        const exponentialHistogram = metric.exponentialHistogram as {
          dataPoints?: unknown[];
        } | undefined;

        pushGaugeOrSumPoints(gauge?.dataPoints, name, resourceAttrs, now, rows, dims);
        pushGaugeOrSumPoints(sum?.dataPoints, name, resourceAttrs, now, rows, dims);
        pushHistogramPoints(
          histogram?.dataPoints,
          name,
          resourceAttrs,
          now,
          rows,
          notices,
          dims,
        );
        pushSummaryPoints(summary?.dataPoints, name, resourceAttrs, now, rows, dims);
        pushExponentialHistogramPoints(
          exponentialHistogram?.dataPoints,
          name,
          resourceAttrs,
          now,
          rows,
          notices,
          dims,
        );

        const hasPts = (block?: { dataPoints?: unknown[] }) =>
          Array.isArray(block?.dataPoints) && block.dataPoints.length > 0;

        const handled =
          hasPts(gauge) ||
          hasPts(sum) ||
          hasPts(histogram) ||
          hasPts(summary) ||
          hasPts(exponentialHistogram);
        if (!handled) {
          const keys = Object.keys(metric).filter((k) => k !== "name");
          if (keys.length > 0) {
            notices.push(
              `metric "${name}": no supported datapoints (${keys.join(", ")})`,
            );
          }
        }
      }
    }
  }

  return { rows, notices };
}
