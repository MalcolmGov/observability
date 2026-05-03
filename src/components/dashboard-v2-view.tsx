"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { traceIdFromAttributes } from "@/lib/trace-id";
import type { DemoSeedApiResponse } from "@/lib/demo-scenario";
import {
  DemoLaunchpad,
  persistDemoSeed,
  readStoredDemoSeed,
} from "@/components/demo-launchpad";
import {
  PulseChartDefs,
  pulseChartAxisTick,
  pulseChartGridStroke,
  pulseChartSeries,
  pulseChartTooltipLabelStyle,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type OverviewPayload = {
  generatedAtMs: number;
  windowMs: number;
  totals: {
    services: number;
    metricPoints1h: number;
    logLines1h: number;
    errorLogs1h: number;
  };
  services: Array<{
    service: string;
    health: "healthy" | "degraded" | "critical";
    receiving: boolean;
    errors1h: number;
    warns1h: number;
    metrics1h: number;
    logs1h: number;
    lastSeenMs: number;
  }>;
};

type LogRow = {
  ts: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
};

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

const RANGE_PRESETS = [
  { id: "15m", label: "15m", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
] as const;

const SLO_STORAGE_KEY = "pulse.slo.targetSuccess";

const SLO_ALLOWED = new Set([0.99, 0.995, 0.999, 0.9995]);

function readInitialSloTarget(): number {
  if (typeof window === "undefined") return 0.995;
  try {
    const raw = localStorage.getItem(SLO_STORAGE_KEY);
    if (raw == null || raw === "") return 0.995;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0.995;
    if (SLO_ALLOWED.has(n)) return n;
    return 0.995;
  } catch {
    return 0.995;
  }
}

function bucketForWindow(windowMs: number): number {
  if (windowMs <= 15 * 60 * 1000) return 60_000;
  if (windowMs <= 60 * 60 * 1000) return 60_000;
  if (windowMs <= 6 * 60 * 60 * 1000) return 5 * 60_000;
  return 10 * 60_000;
}

function formatTick(t: number, windowMs: number): string {
  const d = new Date(t);
  if (windowMs <= 60 * 60 * 1000) return format(d, "HH:mm");
  if (windowMs <= 24 * 60 * 60 * 1000) return format(d, "MMM d HH:mm");
  return format(d, "MMM d");
}

function fmtApmDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtErrRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function healthDot(health: OverviewPayload["services"][0]["health"]) {
  if (health === "critical") return "bg-red-500 shadow shadow-red-500/40";
  if (health === "degraded") return "bg-amber-400 shadow shadow-amber-400/30";
  return "bg-emerald-400 shadow shadow-emerald-400/25";
}

export function DashboardV2View() {
  const [rangeMs, setRangeMs] = useState<number>(RANGE_PRESETS[1].ms);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seriesLatency, setSeriesLatency] = useState<
    { label: string; value: number }[]
  >([]);
  const [seriesRpm, setSeriesRpm] = useState<
    { label: string; value: number }[]
  >([]);
  const [depEdges, setDepEdges] = useState<
    { source: string; target: string; weight: number }[]
  >([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logService, setLogService] = useState("");
  const [live, setLive] = useState(false);
  const [apmServices, setApmServices] = useState<ApmServiceRow[]>([]);
  const [traceLatencySeries, setTraceLatencySeries] = useState<
    { label: string; p50: number; p95: number; p99: number }[]
  >([]);
  const [sloTargetSuccess, setSloTargetSuccess] = useState(0.995);
  const [serverSloTarget, setServerSloTarget] = useState<number | null>(null);
  const [sloPersistError, setSloPersistError] = useState<string | null>(null);
  const [demoSeedMeta, setDemoSeedMeta] = useState<DemoSeedApiResponse | null>(
    null,
  );
  const [demoSeedError, setDemoSeedError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredDemoSeed();
    if (stored?.ok) setDemoSeedMeta(stored);
  }, []);

  useEffect(() => {
    setSloTargetSuccess(readInitialSloTarget());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SLO_STORAGE_KEY, String(sloTargetSuccess));
    } catch {
      /* ignore quota / private mode */
    }
  }, [sloTargetSuccess]);

  const load = useCallback(
    async (mode: "full" | "poll" = "full") => {
      const quiet = mode === "poll";
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      const windowParam = `windowMs=${rangeMs}`;
      try {
        const [overviewRes, apmRes] = await Promise.all([
          fetch(`/api/v1/overview?${windowParam}`),
          fetch(`/api/v1/apm/services?windowMs=${rangeMs}`),
        ]);
        if (!overviewRes.ok) throw new Error("Overview request failed");
        const json = (await overviewRes.json()) as OverviewPayload;
        setData(json);

        if (apmRes.ok) {
          const aj = (await apmRes.json()) as { services: ApmServiceRow[] };
          setApmServices(aj.services);
        } else {
          setApmServices([]);
        }

        const end = json.generatedAtMs;
        const start = end - rangeMs;
        const bucketMs = bucketForWindow(rangeMs);
        const labelFmt = (t: number) => formatTick(t, rangeMs);

        const mapRes = await fetch(
          `/api/v1/service-map?sinceMs=${start}`,
        );
        if (mapRes.ok) {
          const mj = (await mapRes.json()) as {
            edges: { source: string; target: string; weight: number }[];
          };
          setDepEdges(mj.edges.slice(0, 8));
        } else {
          setDepEdges([]);
        }

        const preferred =
          logService && json.services.some((s) => s.service === logService)
            ? logService
            : undefined;
        const svc =
          preferred ??
          json.services.find((s) => s.service === "checkout-api")?.service ??
          json.services[0]?.service;

        if (!svc) {
          setSeriesLatency([]);
          setSeriesRpm([]);
          setLogService("");
          setLogs([]);
          setTraceLatencySeries([]);
          setServerSloTarget(null);
        } else {
          setLogService((prev) =>
            prev && json.services.some((s) => s.service === prev) ? prev : svc,
          );
          const q = (name: string) =>
            `/api/v1/query/metrics?name=${encodeURIComponent(name)}&service=${encodeURIComponent(svc)}&start=${start}&end=${end}&bucketMs=${bucketMs}`;

          const [ra, rb] = await Promise.all([
            fetch(q("http.server.request_duration_ms")),
            fetch(q("http.server.requests")),
          ]);
          if (!ra.ok || !rb.ok) {
            setSeriesLatency([]);
            setSeriesRpm([]);
          } else {
            const ja = (await ra.json()) as {
              series: { t: number; value: number }[];
            };
            const jb = (await rb.json()) as {
              series: { t: number; value: number }[];
            };
            setSeriesLatency(
              ja.series.map((p) => ({
                label: labelFmt(p.t),
                value: p.value,
              })),
            );
            setSeriesRpm(
              jb.series.map((p) => ({
                label: labelFmt(p.t),
                value: p.value,
              })),
            );
          }

          const pick =
            logService && json.services.some((s) => s.service === logService)
              ? logService
              : svc;
          const logParams = new URLSearchParams({
            service: pick,
            limit: "120",
            start: String(start),
            end: String(end),
          });
          const [logRes, latSeriesRes] = await Promise.all([
            fetch(`/api/v1/query/logs?${logParams}`),
            fetch(
              `/api/v1/apm/latency-series?service=${encodeURIComponent(svc)}&windowMs=${rangeMs}`,
            ),
          ]);
          if (logRes.ok) {
            const lj = (await logRes.json()) as { logs: LogRow[] };
            setLogs(lj.logs);
          } else {
            setLogs([]);
          }
          if (latSeriesRes.ok) {
            const latJ = (await latSeriesRes.json()) as {
              series: {
                t: number;
                p50Ms: number;
                p95Ms: number;
                p99Ms: number;
              }[];
            };
            setTraceLatencySeries(
              latJ.series.map((s) => ({
                label: labelFmt(s.t),
                p50: s.p50Ms,
                p95: s.p95Ms,
                p99: s.p99Ms,
              })),
            );
          } else {
            setTraceLatencySeries([]);
          }

          const sloRes = await fetch(
            `/api/v1/slo/targets?service=${encodeURIComponent(svc)}`,
          );
          if (sloRes.ok) {
            const sj = (await sloRes.json()) as { targetSuccess:number | null };
            setServerSloTarget(
              sj.targetSuccess != null && Number.isFinite(sj.targetSuccess)
                ? sj.targetSuccess
                : null,
            );
          } else {
            setServerSloTarget(null);
          }
        }
      } catch (e) {
        if (!quiet) setError(e instanceof Error ? e.message : "Failed");
        if (!quiet) {
          setApmServices([]);
          setTraceLatencySeries([]);
          setServerSloTarget(null);
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [rangeMs, logService],
  );

  useLiveRefresh(live, 15_000, () => void load("poll"));

  useEffect(() => {
    void load("full");
  }, [load]);

  const rangeLabel = useMemo(() => {
    const p = RANGE_PRESETS.find((r) => r.ms === rangeMs);
    return p?.label ?? `${Math.round(rangeMs / 60000)}m`;
  }, [rangeMs]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const t = data.totals;
    return [
      {
        label: "Services",
        value: String(t.services),
        hint: `Active in last ${rangeLabel}`,
      },
      {
        label: "Metric points",
        value: t.metricPoints1h.toLocaleString(),
        hint: "Ingested samples",
      },
      {
        label: "Log lines",
        value: t.logLines1h.toLocaleString(),
        hint: "Structured events",
      },
      {
        label: "Errors",
        value: t.errorLogs1h.toLocaleString(),
        hint: "error level",
      },
    ];
  }, [data, rangeLabel]);

  const chartSvc = useMemo(() => {
    if (!data?.services.length) return undefined;
    const preferred =
      logService && data.services.some((s) => s.service === logService)
        ? logService
        : undefined;
    return (
      preferred ??
      data.services.find((s) => s.service === "checkout-api")?.service ??
      data.services[0]?.service
    );
  }, [data, logService]);

  const sloInsight = useMemo(() => {
    const target = serverSloTarget ?? sloTargetSuccess;
    const svc =
      chartSvc ??
      apmServices.find((s) => s.service === "checkout-api")?.service ??
      apmServices[0]?.service;
    if (!svc) return null;
    const row = apmServices.find((s) => s.service === svc);
    if (!row || row.requests === 0) {
      return {
        service: svc,
        targetPct: target * 100,
        actualSuccessPct: null as number | null,
        budgetRemainingPct: null as number | null,
        status: "nodata" as const,
      };
    }
    const success = 1 - row.errorRate;
    const allowedBad = (1 - target) * row.requests;
    const consumed = row.errorCount;
    const budgetRemainingPct =
      allowedBad > 0
        ? Math.max(
            0,
            Math.min(100, ((allowedBad - consumed) / allowedBad) * 100),
          )
        : 100;
    const status =
      success >= target
        ? ("ok" as const)
        : success >= target - 0.002
          ? ("warn" as const)
          : ("burn" as const);
    return {
      service: svc,
      targetPct: target * 100,
      actualSuccessPct: success * 100,
      budgetRemainingPct,
      status,
      requests: row.requests,
      errors: row.errorCount,
    };
  }, [apmServices, chartSvc, serverSloTarget, sloTargetSuccess]);

  async function runDemoSeed() {
    setDemoSeedError(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/seed", { method: "POST" });
      const body = (await res.json()) as DemoSeedApiResponse;
      if (!res.ok) {
        throw new Error(body.error ?? "Seed failed");
      }
      setDemoSeedMeta(body);
      persistDemoSeed(body);
      await load("full");
    } catch (e) {
      setDemoSeedError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setLoading(false);
    }
  }

  async function persistSloToServer() {
    if (!chartSvc) return;
    setSloPersistError(null);
    try {
      const res = await fetch("/api/v1/slo/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: chartSvc,
          targetSuccess: sloTargetSuccess,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Save failed");
      }
      const j = (await res.json()) as { targetSuccess: number };
      setServerSloTarget(j.targetSuccess);
    } catch (e) {
      setSloPersistError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function clearServerSloOverride() {
    if (!chartSvc) return;
    setSloPersistError(null);
    try {
      const res = await fetch(
        `/api/v1/slo/targets?service=${encodeURIComponent(chartSvc)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Clear failed");
      setServerSloTarget(null);
    } catch (e) {
      setSloPersistError(e instanceof Error ? e.message : "Clear failed");
    }
  }

  return (
    <div className="pulse-page gap-6 py-6 sm:py-8">
      <header className="pulse-page-head border-white/[0.06] pb-5">
        <div>
          <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-xl font-semibold tracking-tight text-transparent sm:text-[1.65rem]">
            Command center
          </h1>
          <p className="pulse-lead">
            KPIs, golden signals, service health, dependencies, and live logs in
            one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="pulse-segment">
            {RANGE_PRESETS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeMs(r.ms)}
                className={`pulse-segment-btn sm:px-3 ${
                  rangeMs === r.ms ? "pulse-segment-btn-active" : ""
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 shadow-inner shadow-slate-950/25">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20 text-violet-500 focus:ring-violet-500/30"
            />
            <span className={live ? "text-emerald-300" : ""}>Live</span>
          </label>
          <button
            type="button"
            onClick={() => void load("full")}
            className="pulse-btn-secondary text-sm"
          >
            Refresh
          </button>
        </div>
      </header>

      <DemoLaunchpad
        loading={loading}
        demoMeta={demoSeedMeta}
        seedError={demoSeedError}
        onSeed={runDemoSeed}
      />

      {error ? (
        <div className="pulse-alert-error">{error}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="pulse-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {k.label}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white">
              {loading && !data ? "—" : k.value}
            </div>
            <div className="mt-1 text-[12px] text-zinc-500">{k.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div
          className={`pulse-card p-5 transition ${
            sloInsight?.status === "burn"
              ? "ring-1 ring-red-500/45 shadow-red-950/25"
              : sloInsight?.status === "warn"
                ? "ring-1 ring-amber-500/35 shadow-amber-950/15"
                : ""
          }`}
        >
          <h2 className="text-sm font-semibold text-white">
            SLO snapshot
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Rolling success target (trace root errors) vs. budget remaining.{" "}
            <Link href="/services" className="pulse-link text-[11px]">
              Services
            </Link>
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="shrink-0">SLO target (browser)</span>
            <select
              value={sloTargetSuccess}
              onChange={(e) => setSloTargetSuccess(Number(e.target.value))}
              className="rounded-md border border-white/15 bg-slate-950/45 px-2 py-1 text-zinc-200"
            >
              <option value={0.99}>99.0% availability</option>
              <option value={0.995}>99.5% availability</option>
              <option value={0.999}>99.9% availability</option>
              <option value={0.9995}>99.95% availability</option>
            </select>
          </label>
          <div className="mt-2 flex flex-col gap-2 text-[11px] text-zinc-500">
            <p>
              {serverSloTarget != null ? (
                <>
                  <span className="text-zinc-400">Server (SQLite)</span> overrides
                  the preset for{" "}
                  <span className="font-medium text-zinc-300">
                    {chartSvc ?? "—"}
                  </span>
                  :{" "}
                  <span className="tabular-nums text-zinc-200">
                    {(serverSloTarget * 100).toFixed(2)}%
                  </span>
                  .
                </>
              ) : (
                <>
                  No server override — evaluation uses the browser preset{" "}
                  <span className="tabular-nums text-zinc-300">
                    {(sloTargetSuccess * 100).toFixed(2)}%
                  </span>
                  {chartSvc ? (
                    <>
                      {" "}
                      for{" "}
                      <span className="font-medium text-zinc-300">
                        {chartSvc}
                      </span>
                    </>
                  ) : null}
                  .
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!chartSvc}
                onClick={() => void persistSloToServer()}
                className="pulse-btn-secondary px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save preset to server
              </button>
              <button
                type="button"
                disabled={!chartSvc || serverSloTarget == null}
                onClick={() => void clearServerSloOverride()}
                className="pulse-btn-ghost px-3 py-1.5 text-[11px] text-zinc-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear server override
              </button>
            </div>
            {sloPersistError ? (
              <p className="text-[11px] text-red-300">{sloPersistError}</p>
            ) : null}
          </div>
          {!sloInsight ? (
            <p className="mt-4 text-xs text-zinc-500">No APM data in range.</p>
          ) : sloInsight.status === "nodata" ? (
            <p className="mt-4 text-xs text-zinc-500">
              No root requests for{" "}
              <span className="text-zinc-300">{sloInsight.service}</span> in
              this window.
            </p>
          ) : (
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2 text-zinc-400">
                <span>Service</span>
                <span className="font-medium text-zinc-200">
                  {sloInsight.service}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-zinc-400">
                <span>Target success</span>
                <span className="tabular-nums text-zinc-200">
                  {sloInsight.targetPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between gap-2 text-zinc-400">
                <span>Actual success</span>
                <span
                  className={`tabular-nums ${
                    sloInsight.actualSuccessPct != null &&
                    sloInsight.actualSuccessPct >= sloInsight.targetPct
                      ? "text-emerald-300"
                      : "text-amber-200"
                  }`}
                >
                  {sloInsight.actualSuccessPct != null
                    ? `${sloInsight.actualSuccessPct.toFixed(2)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-zinc-400">
                <span>Error budget left</span>
                <span className="tabular-nums text-zinc-200">
                  {sloInsight.budgetRemainingPct != null
                    ? `${sloInsight.budgetRemainingPct.toFixed(0)}%`
                    : "—"}
                </span>
              </div>
              <div className="pt-2 text-[10px] leading-relaxed text-zinc-600">
                Budget assumes at most{" "}
                {(100 - sloInsight.targetPct).toFixed(2)}% failed roots for
                {` ${sloInsight.requests} `}
                request
                {sloInsight.requests === 1 ? "" : "s"} (
                {sloInsight.errors} error roots).
              </div>
            </div>
          )}
        </div>

        <div className="pulse-card p-5">
          <div className="text-xs font-semibold text-white">
            Latency percentiles (traces)
          </div>
          <div className="text-[11px] text-zinc-500">
            Root spans · p50 / p95 / p99 ·{" "}
            {chartSvc ?? "select telemetry"}
          </div>
          <div className="mt-3 h-48">
            {traceLatencySeries.length === 0 ? (
              <div className="pulse-chart-empty h-48">
                No trace roots in window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={traceLatencySeries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <PulseChartDefs prefix="dash-latency-lines" />
                  <CartesianGrid strokeDasharray="4 8" stroke={pulseChartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    label={{
                      value: "ms",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#71717a",
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={pulseChartTooltipStyle}
                    labelStyle={pulseChartTooltipLabelStyle}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (
                      <span className="text-zinc-400">{value}</span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    name="p50"
                    stroke={pulseChartSeries.violetStroke}
                    dot={false}
                    strokeWidth={2}
                    filter="url(#dash-latency-lines-glow-violet)"
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    name="p95"
                    stroke={pulseChartSeries.amber}
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="p99"
                    name="p99"
                    stroke={pulseChartSeries.rose}
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="pulse-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Service performance (APM)
            </h2>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Root-span latency percentiles and error rate vs. requests.
            </p>
          </div>
          <Link href="/services" className="pulse-link text-xs">
            View all services →
          </Link>
        </div>
        <div className="pulse-table-wrap mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="pulse-table-head">
              <tr>
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  Traces
                </th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  Roots
                </th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  Err%
                </th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  p95
                </th>
                <th className="px-2 py-2 text-right font-medium">Drill-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {apmServices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No trace roots in this range. Seed demo or ingest spans.
                  </td>
                </tr>
              ) : (
                apmServices.slice(0, 8).map((r) => (
                  <tr key={r.service} className="hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 font-medium text-zinc-200">
                      {r.service}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-400">
                      {r.traces.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-400">
                      {r.requests.toLocaleString()}
                    </td>
                    <td
                      className={`px-2 py-2 text-right tabular-nums ${
                        r.errorRate > 0.01
                          ? "text-red-300"
                          : r.errorRate > 0
                            ? "text-amber-200"
                            : "text-zinc-400"
                      }`}
                    >
                      {r.requests > 0 ? fmtErrRate(r.errorRate) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-400">
                      {fmtApmDur(r.p95Ms)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/traces?service=${encodeURIComponent(r.service)}`}
                        className="pulse-link font-medium"
                      >
                        Traces
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="pulse-card-soft p-5">
          <div className="text-xs font-semibold text-white">
            Latency (avg)
          </div>
          <div className="text-[11px] text-zinc-500">
            http.server.request_duration_ms · {chartSvc ?? "—"}
          </div>
          <div className="mt-4 h-56">
            {seriesLatency.length === 0 ? (
              <div className="pulse-chart-empty h-56">
                No metric series
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seriesLatency} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <PulseChartDefs prefix="dash-metric-lat" />
                  <CartesianGrid strokeDasharray="4 8" stroke={pulseChartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={pulseChartTooltipStyle}
                    labelStyle={pulseChartTooltipLabelStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={pulseChartSeries.violetStroke}
                    fillOpacity={1}
                    fill="url(#dash-metric-lat-area-violet)"
                    strokeWidth={2}
                    filter="url(#dash-metric-lat-glow-violet)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="pulse-card-soft p-5">
          <div className="text-xs font-semibold text-white">Throughput</div>
          <div className="text-[11px] text-zinc-500">
            http.server.requests · {chartSvc ?? "—"}
          </div>
          <div className="mt-4 h-56">
            {seriesRpm.length === 0 ? (
              <div className="pulse-chart-empty h-56">
                No metric series
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seriesRpm} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <PulseChartDefs prefix="dash-metric-rpm" />
                  <CartesianGrid strokeDasharray="4 8" stroke={pulseChartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={pulseChartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={pulseChartTooltipStyle}
                    labelStyle={pulseChartTooltipLabelStyle}
                  />
                  <Bar
                    dataKey="value"
                    fill="url(#dash-metric-rpm-bar-rpm)"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="pulse-card-glow p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Live logs
              </h2>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Window matches the range above.{" "}
                <Link href="/logs" className="pulse-link text-[11px]">
                  Full explorer →
                </Link>
              </p>
            </div>
            {data?.services.length ? (
              <select
                value={logService || chartSvc || ""}
                onChange={(e) => setLogService(e.target.value)}
                className="pulse-select py-1.5 text-xs"
              >
                {data.services.map((s) => (
                  <option key={s.service} value={s.service}>
                    {s.service}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="pulse-scroll mt-4 max-h-[320px] overflow-auto rounded-xl border border-white/[0.06] bg-slate-950/25">
            <table className="w-full text-left text-[11px]">
              <thead className="pulse-table-head">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    Time
                  </th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                  <th className="px-3 py-2 font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {!logs.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-zinc-500"
                    >
                      No logs in this window.
                    </td>
                  </tr>
                ) : (
                  logs.map((row, i) => {
                    const tid = traceIdFromAttributes(row.attributes);
                    return (
                    <tr
                      key={`${row.ts}-${i}`}
                      className="border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">
                        {format(new Date(row.ts), "HH:mm:ss")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 font-medium uppercase ${
                            row.level === "error"
                              ? "bg-red-500/15 text-red-300"
                              : row.level === "warn" ||
                                  row.level === "warning"
                                ? "bg-amber-500/15 text-amber-200"
                                : "bg-zinc-500/15 text-zinc-300"
                          }`}
                        >
                          {row.level}
                        </span>
                      </td>
                      <td className="max-w-0 truncate px-3 py-1.5 text-zinc-200">
                        {row.message}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {tid ? (
                          <Link
                            href={`/traces/${encodeURIComponent(tid)}`}
                            className="pulse-link font-medium text-[11px]"
                          >
                            View
                          </Link>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="pulse-card-glow p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">
                Service health
              </h2>
              <span className="pulse-badge-live text-[10px] normal-case tracking-normal">
                Range
              </span>
            </div>
            <ul className="pulse-scroll mt-4 flex max-h-64 flex-col gap-2 overflow-auto">
              {!data?.services.length ? (
                <li className="pulse-chart-empty border-none bg-transparent px-3 py-8 text-xs">
                  No services. Seed demo or ingest.
                </li>
              ) : (
                data.services.map((s) => (
                  <li
                    key={s.service}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5 shadow-inner shadow-slate-950/25"
                  >
                    <span
                      className={`inline-flex size-2 shrink-0 rounded-full ${healthDot(s.health)}`}
                      title={s.health}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-white">
                        {s.service}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {s.metrics1h} pts · {s.logs1h} logs · {s.errors1h} err
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="pulse-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">
                Dependencies
              </h2>
              <Link href="/map" className="pulse-link text-[10px] font-semibold">
                Map →
              </Link>
            </div>
            {depEdges.length === 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                No edges in range. Ingest traces with peer calls.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {depEdges.map((e) => (
                  <li
                    key={`${e.source}-${e.target}`}
                    className="flex flex-wrap items-center gap-1 text-[10px]"
                  >
                    <span className="font-medium text-violet-200">
                      {e.source}
                    </span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-medium text-emerald-300/90">
                      {e.target}
                    </span>
                    <span className="ml-auto tabular-nums text-zinc-500">
                      {e.weight}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
