"use client";

import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import {
  pulseChartAxisTick,
  pulseChartGridStroke,
  pulseChartLegendWrapperStyle,
  pulseChartSeries,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";
import type { NlQueryApiResponse } from "@/lib/nl-query-schema";
import { NlQueryPanel } from "@/components/nl-query-panel";
import { SavedViewsToolbar } from "@/components/saved-views-toolbar";
import { downloadText, rowsToCsv } from "@/lib/export-download";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesPoint = { t: number; value: number };

type LogRow = {
  ts: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
};

const RANGE_MS = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

type RangeKey = keyof typeof RANGE_MS;

function bucketForRange(key: RangeKey): number {
  if (key === "15m") return 60_000;
  if (key === "1h") return 60_000;
  if (key === "6h") return 5 * 60_000;
  if (key === "7d") return 60 * 60_000;
  return 15 * 60_000;
}

export function MetricsExplorer() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState<string>("");
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>("");
  const [compareMetric, setCompareMetric] = useState<string>("");
  const [rangeKey, setRangeKey] = useState<RangeKey>("1h");
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [series2, setSeries2] = useState<SeriesPoint[]>([]);
  const [seriesPrevPrimary, setSeriesPrevPrimary] = useState<SeriesPoint[]>(
    [],
  );
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [comparePreviousPeriod, setComparePreviousPeriod] = useState(false);
  const [labelRows, setLabelRows] = useState<
    { key: string; cardinality: number; examples: string[] }[]
  >([]);

  const range = useMemo(() => {
    const end = Date.now();
    const start = end - RANGE_MS[rangeKey];
    return { start, end, bucketMs: bucketForRange(rangeKey) };
  }, [rangeKey]);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/v1/services");
    if (!res.ok) throw new Error("Failed to load services");
    const data = (await res.json()) as { services: string[] };
    setServices(data.services);
    setService((prev) => prev || (data.services[0] ?? ""));
  }, []);

  const loadMetricNames = useCallback(async () => {
    if (!service) {
      setMetricNames([]);
      return;
    }
    const res = await fetch(
      `/api/v1/metrics/names?service=${encodeURIComponent(service)}`,
    );
    if (!res.ok) throw new Error("Failed to load metric names");
    const data = (await res.json()) as { names: string[] };
    setMetricNames(data.names);
    setMetric((m) => {
      if (m && data.names.includes(m)) return m;
      return data.names[0] ?? "";
    });
  }, [service]);

  const loadSeries = useCallback(async () => {
    if (!service || !metric) {
      setSeries([]);
      setSeries2([]);
      setSeriesPrevPrimary([]);
      return;
    }
    const base = {
      service,
      start: String(range.start),
      end: String(range.end),
      bucketMs: String(range.bucketMs),
    };
    const q1 = new URLSearchParams({ ...base, name: metric });
    const res1 = await fetch(`/api/v1/query/metrics?${q1}`);
    if (!res1.ok) throw new Error("Failed to query metrics");
    const d1 = (await res1.json()) as { series: SeriesPoint[] };
    setSeries(d1.series);

    if (compareMetric && compareMetric !== metric) {
      const q2 = new URLSearchParams({ ...base, name: compareMetric });
      const res2 = await fetch(`/api/v1/query/metrics?${q2}`);
      if (res2.ok) {
        const d2 = (await res2.json()) as { series: SeriesPoint[] };
        setSeries2(d2.series);
      } else setSeries2([]);
    } else {
      setSeries2([]);
    }

    if (comparePreviousPeriod) {
      const span = range.end - range.start;
      const prevStart = range.start - span;
      const prevEnd = range.start;
      const qp = new URLSearchParams({
        ...base,
        start: String(prevStart),
        end: String(prevEnd),
        name: metric,
      });
      const resp = await fetch(`/api/v1/query/metrics?${qp}`);
      if (resp.ok) {
        const dp = (await resp.json()) as { series: SeriesPoint[] };
        setSeriesPrevPrimary(dp.series);
      } else setSeriesPrevPrimary([]);
    } else {
      setSeriesPrevPrimary([]);
    }
  }, [
    compareMetric,
    comparePreviousPeriod,
    metric,
    range.bucketMs,
    range.end,
    range.start,
    service,
  ]);

  const loadLogs = useCallback(async () => {
    if (!service) {
      setLogs([]);
      return;
    }
    const res = await fetch(
      `/api/v1/query/logs?service=${encodeURIComponent(service)}&limit=40`,
    );
    if (!res.ok) throw new Error("Failed to load logs");
    const data = (await res.json()) as { logs: LogRow[] };
    setLogs(data.logs);
  }, [service]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadServices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [loadServices]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const s = searchParams.get("service");
    if (s) setService(s);
    const m = searchParams.get("metric");
    if (m) setMetric(m);
    const r = searchParams.get("range");
    if (r && r in RANGE_MS) setRangeKey(r as RangeKey);
    const cmp = searchParams.get("compare");
    if (cmp) setCompareMetric(cmp);
  }, [searchParams]);

  const applyNlMetrics = useCallback((plan: NlQueryApiResponse) => {
    if (plan.kind !== "metrics" || !plan.metrics) return;
    setService(plan.metrics.service);
    setMetric(plan.metrics.metricName);
    setRangeKey(plan.metrics.rangeKey);
  }, []);

  const applySavedState = useCallback((state: Record<string, unknown>) => {
    const svc = state.service;
    if (typeof svc === "string" && svc) setService(svc);
    const m = state.metric;
    if (typeof m === "string" && m) setMetric(m);
    const cm = state.compareMetric;
    if (typeof cm === "string") setCompareMetric(cm);
    else if (cm === null) setCompareMetric("");
    const rk = state.rangeKey;
    if (
      typeof rk === "string" &&
      rk in RANGE_MS
    ) {
      setRangeKey(rk as RangeKey);
    }
    const lv = state.live;
    if (typeof lv === "boolean") setLive(lv);
    const cpp = state.comparePreviousPeriod;
    if (typeof cpp === "boolean") setComparePreviousPeriod(cpp);
  }, []);

  const copyMetricsShareLink = useCallback(async () => {
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (metric) params.set("metric", metric);
    params.set("range", rangeKey);
    if (compareMetric.trim()) params.set("compare", compareMetric.trim());
    const url = `${window.location.origin}/metrics?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopiedShare(true);
    window.setTimeout(() => setCopiedShare(false), 2000);
  }, [compareMetric, metric, rangeKey, service]);

  useEffect(() => {
    setCompareMetric("");
  }, [service]);

  useEffect(() => {
    void (async () => {
      try {
        await loadMetricNames();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    })();
  }, [loadMetricNames]);

  useEffect(() => {
    void (async () => {
      try {
        await loadSeries();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    })();
  }, [loadSeries]);

  useEffect(() => {
    void (async () => {
      try {
        await loadLogs();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    })();
  }, [loadLogs]);

  useLiveRefresh(live, 15_000, () => {
    void loadSeries().catch(() => {});
    void loadLogs().catch(() => {});
  });

  useEffect(() => {
    void (async () => {
      if (!service || !metric) {
        setLabelRows([]);
        return;
      }
      const res = await fetch(
        `/api/v1/metrics/labels?service=${encodeURIComponent(service)}&name=${encodeURIComponent(metric)}&sample=300`,
      );
      if (!res.ok) {
        setLabelRows([]);
        return;
      }
      const j = (await res.json()) as {
        labels: { key: string; cardinality: number; examples: string[] }[];
      };
      setLabelRows(j.labels);
    })();
  }, [metric, service]);

  const metricPriorKey = useMemo(
    () => `${metric} · prior window`,
    [metric],
  );

  const chartData = useMemo(() => {
    const byT = new Map<number, { label: string; v1?: number; v2?: number }>();
    for (const p of series) {
      const row = byT.get(p.t) ?? {
        label: format(new Date(p.t), "MMM d HH:mm"),
        v1: undefined,
        v2: undefined,
      };
      row.v1 = p.value;
      byT.set(p.t, row);
    }
    for (const p of series2) {
      const row = byT.get(p.t) ?? {
        label: format(new Date(p.t), "MMM d HH:mm"),
        v1: undefined,
        v2: undefined,
      };
      row.v2 = p.value;
      byT.set(p.t, row);
    }
    const rows = [...byT.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => ({
        ...row,
        [metric]: row.v1,
        ...(compareMetric && compareMetric !== metric
          ? { [compareMetric]: row.v2 }
          : {}),
      }));

    if (!comparePreviousPeriod || seriesPrevPrimary.length === 0) return rows;

    const sortedPrev = [...seriesPrevPrimary].sort((a, b) => a.t - b.t);
    return rows.map((row, i) =>
      sortedPrev[i] != null
        ? { ...row, [metricPriorKey]: sortedPrev[i].value }
        : row,
    );
  }, [
    compareMetric,
    comparePreviousPeriod,
    metric,
    metricPriorKey,
    series,
    series2,
    seriesPrevPrimary,
  ]);

  const exportMetricsCsv = useCallback(() => {
    if (!chartData.length) return;
    const keys = Object.keys(chartData[0] as object).filter((k) => k !== "label");
    const headers = ["label", ...keys];
    const rows = chartData.map((row) => {
      const r = row as Record<string, string | number | undefined>;
      return [r.label as string, ...keys.map((k) => String(r[k] ?? ""))];
    });
    downloadText(
      `metrics-${metric}-${rangeKey}.csv`,
      rowsToCsv(headers, rows),
      "text/csv;charset=utf-8",
    );
  }, [chartData, metric, rangeKey]);

  const exportMetricsJson = useCallback(() => {
    downloadText(
      `metrics-${metric}-${rangeKey}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          service,
          metric,
          compareMetric,
          rangeKey,
          comparePreviousPeriod,
          series: chartData,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );
  }, [
    chartData,
    compareMetric,
    comparePreviousPeriod,
    metric,
    rangeKey,
    service,
  ]);

  async function seedDemo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/seed", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Seed failed",
        );
      }
      await loadServices();
      setService("checkout-api");
      await loadMetricNames();
      await loadSeries();
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Metrics explorer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Multi-series overlays, adaptive rollups, and correlated log snippets
            — closer to how teams debug in production APM.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => void copyMetricsShareLink()}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10"
          >
            {copiedShare ? "Copied link" : "Copy shareable link"}
          </button>
          <SavedViewsToolbar
            page="metrics"
            getState={() => ({
              service,
              metric,
              compareMetric,
              rangeKey,
              live,
              comparePreviousPeriod,
            })}
            applyState={applySavedState}
          />
          <button
            type="button"
            onClick={() => exportMetricsCsv()}
            disabled={!chartData.length}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-white/10 disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => exportMetricsJson()}
            disabled={!chartData.length}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-white/10 disabled:opacity-40"
          >
            Export JSON
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={comparePreviousPeriod}
              onChange={(e) => setComparePreviousPeriod(e.target.checked)}
              className="rounded border-white/20"
            />
            Prior window
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20"
            />
            Live chart (15s)
          </label>
          <button
            type="button"
            onClick={() => void seedDemo()}
            disabled={loading}
            className="pulse-btn-primary disabled:opacity-50"
          >
            Load demo data
          </button>
        </div>
      </header>

      {error ? <div className="pulse-alert-error">{error}</div> : null}

      <NlQueryPanel page="metrics" onApplyMetrics={applyNlMetrics} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-xl shadow-slate-950/30">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Service
              <select
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                {services.length === 0 ? (
                  <option value="">No telemetry yet</option>
                ) : (
                  services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Metric
              <select
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                disabled={!metricNames.length}
              >
                {metricNames.length === 0 ? (
                  <option value="">No metrics</option>
                ) : (
                  metricNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Compare
              <select
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
                value={compareMetric}
                onChange={(e) => setCompareMetric(e.target.value)}
                disabled={!metricNames.length}
              >
                <option value="">None</option>
                {metricNames
                  .filter((n) => n !== metric)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap gap-1 rounded-lg bg-slate-950/35 p-1 ring-1 ring-white/10">
              {(Object.keys(RANGE_MS) as RangeKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRangeKey(k)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    rangeKey === k
                      ? "bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/30"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="h-80 w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-zinc-500">
                No series in this range. Adjust time window or ingest data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06d6c7" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06d6c7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={pulseChartGridStroke} />
                  <XAxis
                    dataKey="label"
                    tick={pulseChartAxisTick}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={pulseChartAxisTick} width={40} />
                  <Tooltip
                    contentStyle={pulseChartTooltipStyle}
                  />
                  <Legend wrapperStyle={pulseChartLegendWrapperStyle} />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="#06d6c7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#fillPrimary)"
                  />
                  {compareMetric && compareMetric !== metric ? (
                    <Area
                      type="monotone"
                      dataKey={compareMetric}
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#fillSecondary)"
                    />
                  ) : null}
                  {comparePreviousPeriod ? (
                    <Line
                      type="monotone"
                      dataKey={metricPriorKey}
                      name={metricPriorKey}
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stat summary bar */}
          {series.length > 0 && (() => {
            const vals = series.map(p => p.value).sort((a, b) => a - b);
            const mn = vals[0] ?? 0;
            const mx = vals[vals.length - 1] ?? 0;
            const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
            const p95idx = Math.floor(vals.length * 0.95);
            const p95 = vals[p95idx] ?? mx;
            const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}`;
            const stats = [['min', fmt(mn)], ['avg', fmt(avg)], ['p95', fmt(p95)], ['max', fmt(mx)]] as const;
            return (
              <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
                {stats.map(([label, val]) => (
                  <div key={label} className="text-center">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-100">{val}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="mt-4 border-t border-white/10 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Label cardinality
            </h3>
            <p className="mt-1 text-[10px] text-zinc-600">
              From recent raw points for this service + metric (cardinality
              guardrails land here in production).
            </p>
            {labelRows.length === 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                No labels or no data yet.
              </p>
            ) : (
              <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-[11px]">
                {labelRows.slice(0, 12).map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-wrap gap-x-2 gap-y-0.5 rounded-lg bg-slate-950/30 px-2 py-1"
                  >
                    <span className="font-mono text-teal-300">{row.key}</span>
                    <span className="text-zinc-500">
                      · {row.cardinality} values
                    </span>
                    <span className="text-zinc-600">
                      e.g. {row.examples.slice(0, 3).join(", ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-xl shadow-slate-950/30">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Correlated logs
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Latest lines for the same service while you read the chart.
            </p>
          </div>
          <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1 font-mono text-[11px]">
            {logs.length === 0 ? (
              <p className="text-zinc-500">No logs yet.</p>
            ) : (
              logs.map((l) => (
                <div
                  key={`${l.ts}-${l.message}`}
                  className="rounded-lg border border-white/5 bg-slate-950/35 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>{format(new Date(l.ts), "HH:mm:ss.SSS")}</span>
                    <span
                      className={`pulse-loglevel ${
                        l.level === "error"
                          ? "pulse-loglevel-error"
                          : l.level === "warn"
                            ? "pulse-loglevel-warn"
                            : l.level === "info"
                              ? "pulse-loglevel-info"
                              : l.level === "debug"
                                ? "pulse-loglevel-debug"
                                : "pulse-loglevel-trace"
                      }`}
                    >
                      {l.level}
                    </span>
                  </div>
                  <div className="mt-1 text-zinc-200">{l.message}</div>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
