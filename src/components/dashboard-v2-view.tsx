"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { traceIdFromAttributes } from "@/lib/trace-id";
import type { DemoSeedApiResponse } from "@/lib/demo-scenario";
import { persistDemoSeed, readStoredDemoSeed } from "@/components/demo-launchpad";
import {
  LatencyPercentileHeatmap,
  SloGaugeArc,
} from "@/components/latency-slo-viz";
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
import {
  PulseChartDefs,
  pulseChartAxisTick,
  pulseChartGridStroke,
  pulseChartSeries,
  pulseChartLegendWrapperStyle,
  pulseChartTooltipLabelStyle,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";

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

/** Tiny inline SVG sparkline — no external deps */
function MiniSparkline({
  data,
  color = "#06d6c7",
  dangerColor = "#fb7185",
  danger = false,
  w = 56,
  h = 20,
}: {
  data: number[];
  color?: string;
  dangerColor?: string;
  danger?: boolean;
  w?: number;
  h?: number;
}) {
  if (data.length < 2)
    return <span className="inline-block animate-pulse rounded bg-white/5" style={{ width: w, height: h }} />;
  const max = Math.max(...data, 0.0001);
  const min = Math.min(...data);
  const range = max - min || max;
  const pts = data
    .map((v, i) => {
      const x = ((i / (data.length - 1)) * w).toFixed(1);
      const y = (h - ((v - min) / range) * (h - 4) - 2).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = danger ? dangerColor : color;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
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
  const [latencyHeatBuckets, setLatencyHeatBuckets] = useState<
    { t: number; p50Ms: number; p95Ms: number; p99Ms: number }[]
  >([]);
  const [sloTargetSuccess, setSloTargetSuccess] = useState(0.995);
  const [serverSloTarget, setServerSloTarget] = useState<number | null>(null);
  const [sloPersistError, setSloPersistError] = useState<string | null>(null);
  const [demoSeedMeta, setDemoSeedMeta] = useState<DemoSeedApiResponse | null>(
    null,
  );
  const [demoSeedError, setDemoSeedError] = useState<string | null>(null);
  const [serviceSparklines, setServiceSparklines] = useState<Record<string, number[]>>({});
  const [prevSeriesLatency, setPrevSeriesLatency] = useState<{ label: string; value: number }[]>([]);
  const [prevSeriesRpm, setPrevSeriesRpm] = useState<{ label: string; value: number }[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const logListRef = useRef<HTMLDivElement>(null);
  const prevLogCountRef = useRef(0);

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
          // Fetch p95 sparklines for each service (up to 8 parallel)
          const svcs = aj.services.slice(0, 8);
          const end2 = Date.now();
          const start2 = end2 - rangeMs;
          const bucketMs2 = bucketForWindow(rangeMs);
          const sparkResults = await Promise.all(
            svcs.map(async (s) => {
              try {
                const r = await fetch(
                  `/api/v1/query/metrics?name=${encodeURIComponent("http.server.request_duration_ms")}&service=${encodeURIComponent(s.service)}&start=${start2}&end=${end2}&bucketMs=${bucketMs2}`
                );
                if (!r.ok) return [s.service, []] as [string, number[]];
                const j = (await r.json()) as { series: { t: number; value: number }[] };
                return [s.service, j.series.map((p) => p.value)] as [string, number[]];
              } catch {
                return [s.service, []] as [string, number[]];
              }
            })
          );
          setServiceSparklines(Object.fromEntries(sparkResults));
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
          setLatencyHeatBuckets([]);
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
              ja.series.map((p) => ({ label: labelFmt(p.t), value: p.value })),
            );
            setSeriesRpm(
              jb.series.map((p) => ({ label: labelFmt(p.t), value: p.value })),
            );

            // Previous-period fetch (runs in background, doesn't block render)
            const prevEnd = start;
            const prevStart = start - rangeMs;
            const qp = (name: string) =>
              `/api/v1/query/metrics?name=${encodeURIComponent(name)}&service=${encodeURIComponent(svc)}&start=${prevStart}&end=${prevEnd}&bucketMs=${bucketMs}`;
            void Promise.all([fetch(qp("http.server.request_duration_ms")), fetch(qp("http.server.requests"))]).then(
              async ([pa, pb]) => {
                const dpa = pa.ok ? ((await pa.json()) as { series: { t: number; value: number }[] }).series : [];
                const dpb = pb.ok ? ((await pb.json()) as { series: { t: number; value: number }[] }).series : [];
                setPrevSeriesLatency(dpa.map((p) => ({ label: labelFmt(p.t), value: p.value })));
                setPrevSeriesRpm(dpb.map((p) => ({ label: labelFmt(p.t), value: p.value })));
              }
            ).catch(() => {});
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
            setLatencyHeatBuckets(latJ.series);
          } else {
            setTraceLatencySeries([]);
            setLatencyHeatBuckets([]);
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
          setLatencyHeatBuckets([]);
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

  // Log volume heatmap — 48 buckets, severity split
  const logHeatmap = useMemo(() => {
    if (!logs.length) return [];
    const N = 48;
    const now = Date.now();
    const winStart = now - rangeMs;
    const bucketMs = rangeMs / N;
    const buckets = Array.from({ length: N }, (_, i) => ({
      t: winStart + i * bucketMs,
      info: 0, warn: 0, error: 0, total: 0,
    }));
    for (const log of logs) {
      const i = Math.min(N - 1, Math.max(0, Math.floor((log.ts - winStart) / bucketMs)));
      const lvl = log.level?.toLowerCase() ?? "info";
      if (lvl === "error" || lvl === "fatal" || lvl === "critical") buckets[i].error++;
      else if (lvl === "warn" || lvl === "warning") buckets[i].warn++;
      else buckets[i].info++;
      buckets[i].total++;
    }
    return buckets;
  }, [logs, rangeMs]);

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
        burnRate: null as number | null,
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
    const allowedErrorFraction = 1 - target;
    const actualErrorFraction = 1 - success;
    const burnRate =
      allowedErrorFraction > 0
        ? Math.max(0, actualErrorFraction / allowedErrorFraction)
        : 0;
    return {
      service: svc,
      targetPct: target * 100,
      actualSuccessPct: success * 100,
      budgetRemainingPct,
      status,
      requests: row.requests,
      errors: row.errorCount,
      burnRate,
    };
  }, [apmServices, chartSvc, serverSloTarget, sloTargetSuccess]);

  // Live log tail — scroll to top (newest-first) when new logs arrive
  useEffect(() => {
    if (!live || !logListRef.current) return;
    logListRef.current.scrollTop = 0;
  }, [logs, live]);

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
    <div className="pulse-page pulse-page-transition gap-6 py-6 sm:py-8">
      <header className="pulse-page-head border-white/[0.06] pb-5">
        <div>
          <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-[1.65rem] font-bold tracking-tight text-transparent" style={{ letterSpacing: '-0.03em' }}>
            Command Center
          </h1>
          <p className="pulse-lead">
            KPIs, golden signals, service health, dependencies, and live logs —
            everything in one place.
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
              className="rounded border-white/20 text-cyan-500 focus:ring-cyan-500/30"
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
          <button
            type="button"
            onClick={() => void runDemoSeed()}
            disabled={loading}
            className="pulse-btn-primary disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load demo data"}
          </button>
        </div>
      </header>

      {/* ── First-run welcome banner ── */}
      {!loading && (!data || data.services.length === 0) && !error && (
        <div className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.07) 0%, rgba(56,189,248,0.04) 100%)", border: "1px solid rgba(6,214,199,0.18)" }}>
          <div className="pointer-events-none absolute -right-12 -top-10 size-48 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #06d6c7, transparent 70%)" }} />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
              style={{ background: "rgba(6,214,199,0.12)", border: "1px solid rgba(6,214,199,0.25)" }}>
              👋
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Welcome to Pulse! No telemetry connected yet.</p>
              <p className="text-[11px] text-zinc-500">
                Connect a data source, load the demo, or follow the setup guide to get started in minutes.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/getting-started"
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition"
                style={{ background: "rgba(6,214,199,0.12)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.3)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.12)"; }}>
                ✦ Getting Started →
              </Link>
              <button type="button" onClick={() => void runDemoSeed()} disabled={loading}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}>
                Load Demo Data
              </button>
            </div>
          </div>
        </div>
      )}


      {error ? (
        <div className="pulse-alert-error">{error}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => {
          const stripes = [
            "pulse-stat-stripe-emerald",
            "pulse-stat-stripe-teal",
            "pulse-stat-stripe-sky",
            "pulse-stat-stripe-rose",
          ] as const;
          const stripe = stripes[i] ?? "pulse-stat-stripe-teal";
          const icons = ["⬡", "◈", "≡", "⚡"] as const;
          return (
            <div key={k.label} className={`pulse-stat-card pulse-fade-in ${stripe} flex flex-col gap-1 p-5 pt-6`}>
              <div className="flex items-start justify-between">
                <div className="pulse-eyebrow">{k.label}</div>
                <span className="text-[11px] text-zinc-700">{icons[i]}</span>
              </div>
              <div className="pulse-display-num mt-1">
                {loading && !data ? (
                  <span className="inline-block h-8 w-20 rounded-lg pulse-skeleton" />
                ) : (
                  k.value
                )}
              </div>
              <div className="pulse-caption">{k.hint}</div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div
          className="pulse-card pulse-transition p-5"
          style={
            sloInsight?.status === "burn"
              ? {
                  boxShadow:
                    "inset 0 0 0 1px var(--pulse-status-danger-border), 0 12px 28px -10px var(--pulse-status-danger-glow)",
                }
              : sloInsight?.status === "warn"
                ? {
                    boxShadow:
                      "inset 0 0 0 1px var(--pulse-status-warning-border), 0 12px 28px -10px var(--pulse-status-warning-glow)",
                  }
                : undefined
          }
        >
          <h2 className="pulse-h3">SLO Snapshot</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Rolling success target vs. error budget remaining.{" "}
            <Link href="/services" className="pulse-link text-[11px]">Services</Link>
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
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2 text-xs">
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

              {/* ── Burn Rate Gauge ── */}
              {sloInsight.burnRate != null && (
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Burn rate</span>
                    <span className={`font-mono text-sm font-bold tabular-nums ${
                      sloInsight.burnRate > 3 ? "text-red-400"
                      : sloInsight.burnRate > 1 ? "text-amber-300"
                      : "text-emerald-400"
                    }`}>
                      {sloInsight.burnRate.toFixed(1)}×
                    </span>
                  </div>
                  {/* track */}
                  <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                        sloInsight.burnRate > 3 ? "bg-red-500"
                        : sloInsight.burnRate > 1 ? "bg-amber-400"
                        : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (sloInsight.burnRate / 10) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-zinc-600">
                    {sloInsight.burnRate > 3
                      ? "Critical — error budget exhausting rapidly"
                      : sloInsight.burnRate > 1
                        ? "Warning — consuming above sustainable rate"
                        : "Healthy — within error budget"}
                  </p>
                </div>
              )}
            </div>
              {sloInsight.actualSuccessPct != null ? (
                <div className="shrink-0 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2">
                  <SloGaugeArc
                    actualPct={sloInsight.actualSuccessPct}
                    targetPct={sloInsight.targetPct}
                    label={`${sloInsight.service} · rolling success`}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="pulse-card p-5">
          <h2 className="pulse-h3">Latency Percentiles</h2>
          <p className="text-[11px] text-zinc-500">
            Root spans · p50 / p95 / p99 ·{" "}
            <span className="font-medium text-zinc-300">{chartSvc ?? "select telemetry"}</span>
          </p>
          <div className="mt-3 h-48">
            {traceLatencySeries.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed" style={{ borderColor: 'rgba(6,214,199,0.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(6,214,199,0.5)" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-400">No trace roots in this window</p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">Ingest spans or load demo data</p>
                </div>
                <button type="button" onClick={() => void runDemoSeed()} disabled={loading} className="pulse-btn-primary py-1.5 text-xs disabled:opacity-50">Load demo</button>
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
                    axisLine={{ stroke: pulseChartGridStroke }}
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
                      fill: pulseChartAxisTick.fill,
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={pulseChartTooltipStyle}
                    labelStyle={pulseChartTooltipLabelStyle}
                  />
                  <Legend
                    wrapperStyle={pulseChartLegendWrapperStyle}
                    formatter={(value) => (
                      <span style={{ color: "var(--pulse-chart-legend-text)" }}>
                        {value}
                      </span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    name="p50"
                    stroke={pulseChartSeries.tealStroke}
                    dot={false}
                    strokeWidth={2}
                    filter="url(#dash-latency-lines-glow-teal)"
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

      {latencyHeatBuckets.length > 0 ? (
        <section className="pulse-card p-5">
          <div className="text-xs font-semibold text-white">
            Latency heatmap
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Percentile intensity over time (same buckets as the trace latency
            chart above).
          </p>
          <div className="mt-4 overflow-x-auto">
            <LatencyPercentileHeatmap
              buckets={latencyHeatBuckets.map((b) => ({
                t: b.t,
                p50: b.p50Ms,
                p95: b.p95Ms,
                p99: b.p99Ms,
              }))}
              formatTick={(t) => formatTick(t, rangeMs)}
            />
          </div>
        </section>
      ) : null}

      <section className="pulse-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="pulse-h3">Service Performance</h2>
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
                <th className="px-2 py-2 text-right font-medium tabular-nums">Traces</th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">Roots</th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">Err%</th>
                <th className="px-2 py-2 text-right font-medium tabular-nums">p95</th>
                <th className="px-2 py-2 font-medium" style={{ width: 72 }}>Trend</th>
                <th className="px-2 py-2 text-right font-medium">Drill-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {apmServices.length === 0 ? (
                <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-3 py-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    <div className="text-center">
                      <p className="text-xs font-medium text-zinc-400">No services found in this range</p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">Seed demo traces or ingest root spans</p>
                    </div>
                    <button type="button" onClick={() => void runDemoSeed()} disabled={loading} className="pulse-btn-primary py-1.5 text-xs disabled:opacity-50">Load demo data</button>
                  </div>
                </td>
              </tr>
              ) : (
                apmServices.slice(0, 8).map((r) => (
                  <tr key={r.service} className="group border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex size-1.5 shrink-0 rounded-full ${r.errorRate > 0.01 ? 'bg-red-400 shadow shadow-red-500/40' : r.errorRate > 0 ? 'bg-amber-400 shadow shadow-amber-400/30' : 'bg-emerald-400 shadow shadow-emerald-400/25'}`} />
                        <span className="font-medium text-zinc-100">{r.service}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-400">{r.traces.toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-400">{r.requests.toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right">
                      {r.requests > 0 ? (
                        <span className={`pulse-chip ${
                          r.errorRate > 0.01 ? 'pulse-chip-danger'
                          : r.errorRate > 0   ? 'pulse-chip-warning'
                          : 'pulse-chip-success'
                        }`}>
                          {fmtErrRate(r.errorRate)}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-zinc-400">{fmtApmDur(r.p95Ms)}</td>
                    {/* Sparkline — p95 latency trend */}
                    <td className="px-2 py-2.5">
                      <MiniSparkline
                        data={serviceSparklines[r.service] ?? []}
                        color="#38bdf8"
                        dangerColor="#fb7185"
                        danger={r.errorRate > 0.01}
                        w={56}
                        h={20}
                      />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Link href={`/traces?service=${encodeURIComponent(r.service)}`} className="pulse-link font-medium">
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="pulse-h3">Latency (avg)</h2>
              <p className="text-[11px] text-zinc-500">
                http.server.request_duration_ms · <span className="text-zinc-300">{chartSvc ?? "—"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowComparison(v => !v)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition ${
                showComparison
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              vs prev
            </button>
          </div>
          <div className="mt-4 h-56">
            {seriesLatency.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed" style={{ borderColor: 'rgba(56,189,248,0.12)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <p className="text-xs text-zinc-500">No metric series — load demo data first</p>
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
                    axisLine={{ stroke: pulseChartGridStroke }}
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
                    name="current"
                    stroke={pulseChartSeries.tealStroke}
                    fillOpacity={1}
                    fill="url(#dash-metric-lat-area-teal)"
                    strokeWidth={2}
                    filter="url(#dash-metric-lat-glow-teal)"
                  />
                  {showComparison && prevSeriesLatency.length > 0 && (
                    <Line
                      type="monotone"
                      data={prevSeriesLatency}
                      dataKey="value"
                      name="prev period"
                      stroke="#64748b"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      opacity={0.55}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="pulse-card-soft p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="pulse-h3">Throughput</h2>
              <p className="text-[11px] text-zinc-500">
                http.server.requests · <span className="text-zinc-300">{chartSvc ?? "—"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowComparison(v => !v)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition ${
                showComparison
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              vs prev
            </button>
          </div>
          <div className="mt-4 h-56">
            {seriesRpm.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed" style={{ borderColor: 'rgba(56,189,248,0.12)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <p className="text-xs text-zinc-500">No throughput data — load demo data first</p>
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
                    axisLine={{ stroke: pulseChartGridStroke }}
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
                <h2 className="pulse-h3">Live Logs</h2>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Window matches the range above.{" "}
                  <Link href="/logs" className="pulse-link text-[11px]">Full explorer →</Link>
                </p>
              </div>
            <div className="flex items-center gap-2">
              {live && logs.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400" style={{ borderColor: 'rgba(16,217,138,0.25)', background: 'rgba(16,217,138,0.08)' }}>
                  <span className="inline-block size-1.5 animate-ping rounded-full bg-emerald-400" />
                  Streaming
                </span>
              )}
              {data?.services.length ? (
                <select
                  value={logService || chartSvc || ""}
                  onChange={(e) => setLogService(e.target.value)}
                  className="pulse-select py-1.5 text-xs"
                >
                  {data.services.map((s) => (
                    <option key={s.service} value={s.service}>{s.service}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {/* ── Log Volume Heatmap ── */}
          {logHeatmap.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] uppercase tracking-widest text-zinc-600">Log volume</p>
              <div className="flex gap-px overflow-hidden rounded-lg">
                {logHeatmap.map((b, i) => {
                  const dominant = b.error > 0 ? 'error' : b.warn > 0 ? 'warn' : b.total > 0 ? 'info' : 'none';
                  const bg = dominant === 'error'
                    ? `rgba(251,113,133,${Math.min(0.9, 0.2 + b.error * 0.15)})`
                    : dominant === 'warn'
                      ? `rgba(251,191,36,${Math.min(0.85, 0.15 + b.warn * 0.12)})`
                      : dominant === 'info'
                        ? `rgba(56,189,248,${Math.min(0.7, 0.1 + b.info * 0.08)})`
                        : 'rgba(255,255,255,0.03)';
                  return (
                    <div
                      key={i}
                      className="h-5 flex-1 cursor-default transition-opacity hover:opacity-75"
                      style={{ background: bg, minWidth: 2 }}
                      title={`${b.error} error · ${b.warn} warn · ${b.info} info`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-zinc-700">
                <span>← older</span><span>now →</span>
              </div>
            </div>
          )}
          <div
            ref={logListRef}
            className="pulse-scroll mt-4 max-h-[320px] overflow-auto rounded-xl border border-white/[0.06] bg-slate-950/25">
            <table className="w-full text-left text-[11px]">
              <thead className="pulse-table-head">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Time</th>
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
                    const isNew = live && i < (logs.length - prevLogCountRef.current);
                    if (i === logs.length - 1) prevLogCountRef.current = logs.length;
                    const tid = traceIdFromAttributes(row.attributes);
                    return (
                    <tr
                      key={`${row.ts}-${i}`}
                      className={`border-b border-white/5 transition hover:bg-white/[0.03] ${isNew ? 'pulse-log-row-new' : ''}`}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">
                        {format(new Date(row.ts), "HH:mm:ss")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            row.level === "error"
                              ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/25"
                              : row.level === "warn" || row.level === "warning"
                                ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25"
                                : row.level === "info"
                                  ? "bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/20"
                                  : "bg-zinc-500/15 text-zinc-400 ring-1 ring-white/10"
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
              <h2 className="pulse-h3">Service Health</h2>
              <span className="pulse-badge-live text-[10px] normal-case tracking-normal">
                Range
              </span>
            </div>
            <ul className="pulse-scroll mt-4 flex max-h-64 flex-col gap-2 overflow-auto">
              {!data?.services.length ? (
                <li className="flex flex-col items-center gap-3 py-6">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(6,214,199,0.35)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-center text-[11px] text-zinc-600">No services. Load demo data to populate.</p>
                  <button type="button" onClick={() => void runDemoSeed()} disabled={loading} className="pulse-btn-primary py-1 text-xs disabled:opacity-50">Seed demo</button>
                </li>
              ) : (
                data.services.map((s) => (
                  <li
                    key={s.service}
                    className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-slate-950/40 px-3 py-2.5 transition hover:border-white/[0.09] hover:bg-slate-950/60"
                  >
                    <span
                      className={`relative flex size-2.5 shrink-0`}
                    >
                      <span className={`inline-flex size-2.5 rounded-full ${healthDot(s.health)}`} title={s.health} />
                      {s.health !== "healthy" && (
                        <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${s.health === "critical" ? 'bg-red-500' : 'bg-amber-400'}`} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-100">{s.service}</div>
                      <div className="text-[10px] text-zinc-600">
                        {s.metrics1h} pts · {s.logs1h} logs
                        {s.errors1h > 0 ? <span className="ml-1 text-red-400">· {s.errors1h} err</span> : null}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      s.health === 'critical' ? 'text-red-400' : s.health === 'degraded' ? 'text-amber-300' : 'text-emerald-400'
                    }`}>{s.health}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="pulse-card p-5">
              <div>
                <h2 className="pulse-h3">Dependencies</h2>
                <Link href="/map" className="pulse-link text-[10px] font-semibold">Map →</Link>
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
                    className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.04] bg-slate-950/30 px-2 py-1.5 text-[10px] transition hover:border-white/[0.08]"
                  >
                    <span className="font-medium text-cyan-300">
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
