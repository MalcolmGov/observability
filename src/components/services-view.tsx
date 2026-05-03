"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import {
  pulseChartAxisTickDense,
  pulseChartGridStroke,
  pulseChartLegendWrapperStyle,
  pulseChartSeries,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RANGE_PRESETS = [
  { id: "15m", label: "15m", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
] as const;

type ApmServiceRow = {
  service: string;
  traces: number;
  requests: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

type OperationRow = {
  resource: string;
  requests: number;
  errorCount: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

type LatencyPt = {
  label: string;
  p50: number;
  p95: number;
  p99: number;
};

function fmtDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 10) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function ServicesView() {
  const searchParams = useSearchParams();
  const scopeQs = useMemo(() => {
    const p = searchParams.get("product")?.trim();
    const m = searchParams.get("market")?.trim();
    const e =
      searchParams.get("environment")?.trim() ??
      searchParams.get("env")?.trim();
    const q = new URLSearchParams();
    if (p) q.set("product", p);
    if (m) q.set("market", m);
    if (e) q.set("environment", e);
    const s = q.toString();
    return s ? `&${s}` : "";
  }, [searchParams]);

  const scopeProduct = searchParams.get("product")?.trim() ?? "";
  const scopeMarket = searchParams.get("market")?.trim() ?? "";
  const scopeEnv =
    searchParams.get("environment")?.trim() ??
    searchParams.get("env")?.trim() ??
    "";

  const [rangeMs, setRangeMs] = useState(RANGE_PRESETS[1].ms);
  const [rows, setRows] = useState<ApmServiceRow[]>([]);
  const [focusService, setFocusService] = useState<string | null>(null);
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [latencyPts, setLatencyPts] = useState<LatencyPt[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const load = useCallback(async (mode: "full" | "poll" = "full") => {
    const quiet = mode === "poll";
    if (!quiet) {
      setError(null);
      setLoading(true);
    }
    try {
      const res = await fetch(
        `/api/v1/apm/services?windowMs=${rangeMs}${scopeQs}`,
      );
      if (!res.ok) throw new Error("APM request failed");
      const json = (await res.json()) as { services: ApmServiceRow[] };
      setRows(json.services);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [rangeMs, scopeQs]);

  const loadServiceDetail = useCallback(
    async (mode: "full" | "poll" = "full") => {
      const quiet = mode === "poll";
      if (!focusService) {
        setOperations([]);
        setLatencyPts([]);
        return;
      }
      if (!quiet) setDetailLoading(true);
      try {
        const [opRes, latRes] = await Promise.all([
          fetch(
            `/api/v1/apm/operations?service=${encodeURIComponent(focusService)}&windowMs=${rangeMs}${scopeQs}`,
          ),
          fetch(
            `/api/v1/apm/latency-series?service=${encodeURIComponent(focusService)}&windowMs=${rangeMs}${scopeQs}`,
          ),
        ]);
        if (opRes.ok) {
          const j = (await opRes.json()) as { operations: OperationRow[] };
          setOperations(j.operations);
        } else setOperations([]);
        if (latRes.ok) {
          const j = (await latRes.json()) as {
            series: {
              t: number;
              p50Ms: number;
              p95Ms: number;
              p99Ms: number;
            }[];
          };
          const fmt = (t: number) =>
            rangeMs <= 60 * 60 * 1000
              ? format(new Date(t), "HH:mm")
              : format(new Date(t), "MMM d HH:mm");
          setLatencyPts(
            j.series.map((s) => ({
              label: fmt(s.t),
              p50: s.p50Ms,
              p95: s.p95Ms,
              p99: s.p99Ms,
            })),
          );
        } else setLatencyPts([]);
      } finally {
        if (!quiet) setDetailLoading(false);
      }
    },
    [focusService, rangeMs, scopeQs],
  );

  useEffect(() => {
    void load("full");
  }, [load]);

  useEffect(() => {
    if (!rows.length) {
      setFocusService(null);
      setOperations([]);
      setLatencyPts([]);
      return;
    }
    setFocusService((prev) =>
      prev && rows.some((r) => r.service === prev) ? prev : rows[0].service,
    );
  }, [rows]);

  useEffect(() => {
    void loadServiceDetail("full");
  }, [loadServiceDetail]);

  useLiveRefresh(live, 15_000, () => {
    void load("poll");
    void loadServiceDetail("poll");
  });

  const rangeLabel = useMemo(() => {
    return RANGE_PRESETS.find((r) => r.ms === rangeMs)?.label ?? "";
  }, [rangeMs]);

  async function seedDemo() {
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/seed", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Seed failed");
      }
      await load("full");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  return (
    <div className="pulse-page pulse-page-transition gap-6 py-6 sm:py-8">
      <header className="pulse-page-head border-white/[0.06] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-[1.65rem] font-bold tracking-tight text-transparent" style={{ letterSpacing: '-0.03em' }}>
            Services
          </h1>
          <p className="pulse-lead">
            APM-style inventory: request volume, error rate, and latency
            percentiles from root spans — similar to Datadog APM and Dynatrace.
          </p>
          {(scopeProduct || scopeMarket || scopeEnv) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Scoped
              </span>
              {scopeProduct ? (
                <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs text-teal-300 ring-1 ring-teal-500/25">
                  product={scopeProduct}
                </span>
              ) : null}
              {scopeMarket ? (
                <span className="rounded-md bg-cyan-500/12 px-2 py-0.5 text-xs text-cyan-100 ring-1 ring-cyan-500/25">
                  market={scopeMarket}
                </span>
              ) : null}
              {scopeEnv ? (
                <span className="rounded-md bg-zinc-500/15 px-2 py-0.5 text-xs text-zinc-300 ring-1 ring-white/10">
                  env={scopeEnv}
                </span>
              ) : null}
              <Link
                href="/services"
                className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Clear filters
              </Link>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="pulse-segment">
            {RANGE_PRESETS.map((r) => (
              <button
                key={r.id} type="button"
                onClick={() => setRangeMs(r.ms)}
                className={`pulse-segment-btn sm:px-3 ${rangeMs === r.ms ? 'pulse-segment-btn-active' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 shadow-inner shadow-slate-950/25">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="rounded border-white/20 text-cyan-500 focus:ring-cyan-500/30" />
            <span className={live ? 'text-emerald-300' : ''}>Live</span>
          </label>
          <button type="button"
            onClick={() => { void load("full"); void loadServiceDetail("full"); }}
            className="pulse-btn-secondary">
            Refresh
          </button>
          <button type="button" onClick={() => void seedDemo()} className="pulse-btn-primary">
            Demo data
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="pulse-fade-in overflow-x-auto rounded-2xl border border-[var(--pulse-border-default)] bg-slate-950/50 shadow-lg shadow-slate-950/25">
        <table className="pulse-table min-w-[720px]">
          <thead>
            <tr>
              <th>Service</th>
              <th className="text-right">Traces</th>
              <th className="text-right">Requests</th>
              <th className="text-right">Err rate</th>
              <th className="text-right">p50</th>
              <th className="text-right">p95</th>
              <th className="text-right">p99</th>
              <th className="text-right">Drill-in</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                  No spans in the last {rangeLabel}. Ingest traces or load demo
                  data.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.service}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocusService(r.service)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFocusService(r.service);
                    }
                  }}
                  className={`cursor-pointer outline-none transition hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/50 ${
                    focusService === r.service
                      ? "bg-indigo-500/10 ring-1 ring-indigo-500/25"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-100">
                    {r.service}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                    {r.traces.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                    {r.requests.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums`}
                  >
                    <span className={`pulse-chip ${
                      r.errorRate > 0.01 ? 'pulse-chip-danger'
                      : r.errorRate > 0 ? 'pulse-chip-warning'
                      : 'pulse-chip-neutral'
                    }`}>
                      {fmtPct(r.errorRate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                    {fmtDur(r.p50Ms)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                    {fmtDur(r.p95Ms)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                    {fmtDur(r.p99Ms)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div
                      className="flex flex-wrap justify-end gap-2 text-[11px] font-medium"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/traces?service=${encodeURIComponent(r.service)}`}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Traces
                      </Link>
                      <Link
                        href={`/logs?service=${encodeURIComponent(r.service)}`}
                        className="text-indigo-400/80 hover:text-indigo-300"
                      >
                        Logs
                      </Link>
                      <Link
                        href={`/metrics?service=${encodeURIComponent(r.service)}`}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        Metrics
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {focusService && !loading && rows.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                Endpoints / resources
              </h2>
              {detailLoading ? (
                <span className="text-[10px] text-zinc-500">Loading…</span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Root spans grouped by{" "}
              <code className="text-zinc-400">http.route</code> or span name ·{" "}
              <span className="text-zinc-300">{focusService}</span>
            </p>
            <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-[var(--pulse-border-light)]">
              <table className="pulse-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th className="text-right">Req</th>
                    <th className="text-right">Err%</th>
                    <th className="text-right">p95</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-2 py-6 text-center text-zinc-500"
                      >
                        No root operations in range.
                      </td>
                    </tr>
                  ) : (
                    operations.slice(0, 20).map((o) => (
                      <tr key={o.resource} className="hover:bg-white/[0.02]">
                        <td className="max-w-[200px] truncate px-2 py-1.5 text-zinc-200">
                          {o.resource}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">
                          {o.requests}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            o.errorRate > 0 ? "text-amber-200" : "text-zinc-500"
                          }`}
                        >
                          {fmtPct(o.errorRate)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">
                          {fmtDur(o.p95Ms)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">
              Latency percentiles over time
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Bucketed root-span durations · {focusService}
            </p>
            <div className="mt-2 h-56">
              {latencyPts.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-zinc-500">
                  No series in window.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyPts}>
                    <CartesianGrid strokeDasharray="3 3" stroke={pulseChartGridStroke} />
                    <XAxis
                      dataKey="label"
                      tick={pulseChartAxisTickDense}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={pulseChartAxisTickDense}
                      width={32}
                      label={{
                        value: "ms",
                        angle: -90,
                        position: "insideLeft",
                        fill: pulseChartAxisTickDense.fill,
                        fontSize: 9,
                      }}
                    />
                    <Tooltip
                      contentStyle={pulseChartTooltipStyle}
                    />
                    <Legend
                      wrapperStyle={{ ...pulseChartLegendWrapperStyle, fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      name="p50"
                      stroke={pulseChartSeries.cyan}
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="p95"
                      name="p95"
                      stroke={pulseChartSeries.amberLine}
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="p99"
                      name="p99"
                      stroke={pulseChartSeries.roseLine}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-zinc-600">
        Requests and latency percentiles use root spans only (no parent).
        Services that only appear as downstream children show trace counts with
        latency unavailable until a root span is reported for that service.
      </p>
    </div>
  );
}
