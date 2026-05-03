"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import {
  pulseChartAxisTick,
  pulseChartGridStroke,
  pulseChartSeries,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";

type ExploreMode = "logs" | "metrics" | "traces";

const RANGE_MS = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
} as const;
type RangeKey = keyof typeof RANGE_MS;

const MODE_META: Record<
  ExploreMode,
  { label: string; hint: string; placeholder: string }
> = {
  logs: {
    label: "Logs",
    hint: "Plain-text search in log messages for the selected service.",
    placeholder: 'error OR timeout OR user_id:"…"',
  },
  metrics: {
    label: "Metrics",
    hint: "PromQL subset: metric name or metric{service=\"checkout-api\",route=\"/pay\"}.",
    placeholder: 'http.server.request_duration_ms{service="checkout-api"}',
  },
  traces: {
    label: "Traces",
    hint: "Filter by service, or paste a trace ID (hex) to open the waterfall.",
    placeholder: "checkout-api  ·  or paste trace id…",
  },
};

type LogRow = {
  ts: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
};

type InspectorSnap = {
  url: string;
  status: number;
  ms: number;
  preview: string;
};

const RECENT_KEY = "pulse-explore-recent-v1";

function loadRecent(): Record<ExploreMode, string[]> {
  if (typeof window === "undefined") {
    return { logs: [], metrics: [], traces: [] };
  }
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) throw new Error("empty");
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      logs: Array.isArray(p.logs)
        ? (p.logs as string[]).filter((x) => typeof x === "string")
        : [],
      metrics: Array.isArray(p.metrics)
        ? (p.metrics as string[]).filter((x) => typeof x === "string")
        : [],
      traces: Array.isArray(p.traces)
        ? (p.traces as string[]).filter((x) => typeof x === "string")
        : [],
    };
  } catch {
    return { logs: [], metrics: [], traces: [] };
  }
}

function pushRecent(mode: ExploreMode, query: string) {
  const q = query.trim();
  if (!q || typeof window === "undefined") return;
  const cur = loadRecent();
  const list = [q, ...cur[mode].filter((x) => x !== q)].slice(0, 8);
  cur[mode] = list;
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur));
}

function traceIdLooksLike(s: string): boolean {
  const t = s.trim();
  return /^[a-f0-9][a-f0-9-]{15,}$/i.test(t);
}

export function ExploreView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ExploreMode>("logs");
  const [rangeKey, setRangeKey] = useState<RangeKey>("1h");
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [live, setLive] = useState(false);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [series, setSeries] = useState<{ t: number; value: number }[]>([]);
  const [promMeta, setPromMeta] = useState<unknown>(null);
  const [traces, setTraces] = useState<
    {
      traceId: string;
      startTs: number;
      durationMs: number;
      spanCount: number;
      errorCount: number;
      rootService: string;
      rootName: string;
    }[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorSnap | null>(null);
  const [recent, setRecent] = useState<Record<ExploreMode, string[]>>(() =>
    loadRecent(),
  );
  const [expandedLogKeys, setExpandedLogKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [copiedShare, setCopiedShare] = useState(false);

  const windowMs = RANGE_MS[rangeKey];

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "metrics" || m === "logs" || m === "traces") setMode(m);
    const q0 = searchParams.get("q");
    if (q0) setQuery(q0);
    const svc = searchParams.get("service");
    if (svc) setService(svc);
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/services");
        if (!res.ok) return;
        const data = (await res.json()) as { services: string[] };
        setServices(data.services);
        setService((prev) => prev || data.services[0] || "");
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const syncUrlAfterRun = useCallback(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (service.trim()) params.set("service", service.trim());
    if (query.trim()) params.set("q", query.trim());
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  }, [mode, query, router, service]);

  const runQuery = useCallback(async () => {
    setError(null);
    setLoading(true);
    const t0 = performance.now();

    try {
      if (mode === "logs") {
        if (!service) {
          setError("Pick a service for log queries.");
          setLogs([]);
          return;
        }
        const end = Date.now();
        const start = end - windowMs;
        const params = new URLSearchParams({
          service,
          limit: "200",
          start: String(start),
          end: String(end),
        });
        if (query.trim()) params.set("q", query.trim());
        if (level && level !== "all") params.set("level", level);
        const url = `/api/v1/query/logs?${params}`;
        const res = await fetch(url);
        const ms = Math.round(performance.now() - t0);
        const text = await res.text();
        let preview = text;
        if (preview.length > 4000) preview = `${preview.slice(0, 4000)}…`;
        setInspector({ url, status: res.status, ms, preview });
        if (!res.ok) {
          try {
            const j = JSON.parse(text) as { error?: string };
            throw new Error(j.error ?? `HTTP ${res.status}`);
          } catch {
            throw new Error(`Logs query failed (${res.status})`);
          }
        }
        const data = JSON.parse(text) as { logs: LogRow[] };
        setLogs(data.logs ?? []);
        pushRecent("logs", query);
        setRecent(loadRecent());
        syncUrlAfterRun();
      } else if (mode === "metrics") {
        const qRaw = query.trim();
        if (!qRaw) {
          setError("Enter a PromQL selector.");
          setSeries([]);
          return;
        }
        const end = Date.now();
        const start = end - windowMs;
        const bucketMs =
          rangeKey === "15m"
            ? 60_000
            : rangeKey === "1h"
              ? 60_000
              : rangeKey === "6h"
                ? 5 * 60_000
                : 15 * 60_000;
        const params = new URLSearchParams({
          q: qRaw,
          start: String(start),
          end: String(end),
          bucketMs: String(bucketMs),
        });
        const url = `/api/v1/query/promql?${params}`;
        const res = await fetch(url);
        const ms = Math.round(performance.now() - t0);
        const text = await res.text();
        let preview = text;
        if (preview.length > 4000) preview = `${preview.slice(0, 4000)}…`;
        setInspector({ url, status: res.status, ms, preview });
        if (!res.ok) {
          try {
            const j = JSON.parse(text) as { error?: string };
            throw new Error(j.error ?? `HTTP ${res.status}`);
          } catch {
            throw new Error(`PromQL query failed (${res.status})`);
          }
        }
        const data = JSON.parse(text) as {
          series: { t: number; value: number }[];
          parsed?: unknown;
        };
        setSeries(data.series ?? []);
        setPromMeta(data.parsed ?? null);
        pushRecent("metrics", query);
        setRecent(loadRecent());
        syncUrlAfterRun();
      } else {
        const svc =
          query.trim() && !traceIdLooksLike(query)
            ? query.trim()
            : service;
        if (!svc) {
          setError("Pick a service or type a service name in the query bar.");
          setTraces([]);
          return;
        }
        const params = new URLSearchParams({
          sinceMs: String(windowMs),
          limit: "80",
        });
        params.set("service", svc);
        if (errorsOnly) params.set("errorsOnly", "1");
        const url = `/api/v1/traces?${params}`;
        const res = await fetch(url);
        const ms = Math.round(performance.now() - t0);
        const text = await res.text();
        let preview = text;
        if (preview.length > 4000) preview = `${preview.slice(0, 4000)}…`;
        setInspector({ url, status: res.status, ms, preview });
        if (!res.ok) throw new Error(`Traces failed (${res.status})`);
        const data = JSON.parse(text) as {
          traces: typeof traces;
        };
        setTraces(data.traces ?? []);
        pushRecent("traces", query || svc);
        setRecent(loadRecent());
        syncUrlAfterRun();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
      if (mode === "logs") setLogs([]);
      if (mode === "metrics") setSeries([]);
      if (mode === "traces") setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [
    errorsOnly,
    level,
    mode,
    query,
    rangeKey,
    service,
    syncUrlAfterRun,
    windowMs,
  ]);

  useLiveRefresh(live && mode === "logs", 5000, () => {
    void runQuery();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key !== "Enter") return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        e.preventDefault();
        void runQuery();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runQuery]);

  const chartData = useMemo(
    () =>
      series.map((p) => ({
        ...p,
        label: format(new Date(p.t), rangeKey === "24h" ? "MMM d HH:mm" : "HH:mm"),
      })),
    [rangeKey, series],
  );

  const traceLinkId = traceIdLooksLike(query) ? query.trim() : null;

  const logLevelCounts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0, debug: 0, other: 0 };
    for (const row of logs) {
      const L = row.level.toLowerCase();
      if (L === "error") c.error += 1;
      else if (L === "warn" || L === "warning") c.warn += 1;
      else if (L === "info") c.info += 1;
      else if (L === "debug") c.debug += 1;
      else c.other += 1;
    }
    return c;
  }, [logs]);

  const metricStats = useMemo(() => {
    if (!series.length) return null;
    const vals = series.map((s) => s.value).filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
      last: vals[vals.length - 1]!,
    };
  }, [series]);

  const traceStats = useMemo(() => {
    if (!traces.length) return null;
    const errN = traces.filter((t) => t.errorCount > 0).length;
    const durs = traces.map((t) => t.durationMs);
    const avgMs =
      durs.reduce((a, b) => a + b, 0) / Math.max(durs.length, 1);
    return { count: traces.length, errors: errN, avgMs };
  }, [traces]);

  const timeWindowLabel = useMemo(() => {
    const end = Date.now();
    const start = end - windowMs;
    return `${format(start, "MMM d HH:mm")} → ${format(end, "MMM d HH:mm")}`;
  }, [windowMs]);

  const copyExploreLink = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (service.trim()) params.set("service", service.trim());
    if (query.trim()) params.set("q", query.trim());
    const url = `${window.location.origin}/explore?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopiedShare(true);
    window.setTimeout(() => setCopiedShare(false), 2200);
  }, [mode, query, service]);

  const toggleLogExpand = useCallback((key: string) => {
    setExpandedLogKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const logHistMax = useMemo(() => {
    const v = Object.values(logLevelCounts);
    return Math.max(1, ...v);
  }, [logLevelCounts]);

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <header className="rounded-2xl border border-orange-500/10 bg-gradient-to-br from-orange-950/25 via-slate-950/40 to-slate-950/20 px-5 py-6 shadow-xl shadow-black/20 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="pulse-eyebrow text-[11px] text-orange-300/95 sm:text-xs">
              Grafana-style explore
            </p>
            <h1 className="mt-2 bg-gradient-to-r from-orange-200 via-amber-100 to-zinc-200 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              Explore
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-zinc-400">
              Ad-hoc logs, PromQL, and traces in one workspace—with inspector,
              shareable URLs, and live log refresh.
            </p>
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1 font-mono text-[11px] text-zinc-400">
                {timeWindowLabel}
              </span>
              <span className="text-zinc-600">·</span>
              <span>Last {rangeKey}</span>
              {loading ? (
                <span className="text-orange-400/90">· querying…</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyExploreLink()}
              className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-orange-500/25 hover:bg-orange-500/10 hover:text-orange-100"
            >
              {copiedShare ? "Link copied" : "Share URL"}
            </button>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={live}
                disabled={mode !== "logs"}
                onChange={(e) => setLive(e.target.checked)}
                className="rounded border-white/20 text-orange-500 focus:ring-orange-500/30 disabled:opacity-40"
              />
              Live
            </label>
            <button
              type="button"
              onClick={() => setInspectorOpen((o) => !o)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                inspectorOpen
                  ? "border-orange-500/35 bg-orange-500/10 text-orange-100"
                  : "border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:border-white/[0.12]"
              }`}
            >
              Inspector
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.07] bg-slate-950/50 p-1.5 sm:gap-1">
          {(Object.keys(MODE_META) as ExploreMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold uppercase tracking-wide transition sm:px-6 sm:py-3 sm:text-[15px] ${
                mode === m
                  ? "bg-gradient-to-r from-orange-500/30 to-amber-500/20 text-orange-50 ring-1 ring-orange-400/35"
                  : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
              }`}
            >
              {MODE_META[m].label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-zinc-500">{MODE_META[mode].hint}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {mode !== "metrics" ? (
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="min-h-[44px] rounded-xl border border-white/[0.1] bg-slate-950/70 px-4 py-2.5 text-base text-zinc-100 outline-none focus:border-orange-500/35"
              aria-label="Service"
            >
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="min-h-[44px] rounded-xl border border-white/[0.1] bg-slate-950/70 px-4 py-2.5 text-base text-zinc-100 outline-none"
            aria-label="Time range"
          >
            {(Object.keys(RANGE_MS) as RangeKey[]).map((k) => (
              <option key={k} value={k}>
                Last {k}
              </option>
            ))}
          </select>
          {mode === "logs" ? (
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="min-h-[44px] rounded-xl border border-white/[0.1] bg-slate-950/70 px-4 py-2.5 text-base text-zinc-100"
              aria-label="Log level"
            >
              <option value="all">All levels</option>
              <option value="error">error</option>
              <option value="warn">warn</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
          ) : null}
          {mode === "traces" ? (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
                className="rounded border-white/20 text-rose-500"
              />
              Errors only
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void runQuery()}
            disabled={loading}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 px-8 py-2.5 text-base font-semibold text-white shadow-lg shadow-orange-950/35 transition hover:from-orange-400 hover:to-amber-500 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run query"}
          </button>
          <span className="hidden text-xs text-zinc-600 sm:inline">
            <kbd className="rounded border border-white/[0.08] bg-slate-950/80 px-1 font-mono">
              ⌘↵
            </kbd>{" "}
            run from editor
          </span>
          {traceLinkId ? (
            <Link
              href={`/traces/${encodeURIComponent(traceLinkId)}`}
              className="min-h-[44px] rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-base font-medium text-cyan-100 hover:bg-cyan-500/15"
            >
              Open trace
            </Link>
          ) : null}
        </div>

        <div className="relative mt-5">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={MODE_META[mode].placeholder}
            rows={mode === "metrics" ? 5 : 3}
            spellCheck={false}
            className="min-h-[100px] w-full resize-y rounded-xl border border-orange-500/35 bg-black/35 px-5 py-4 font-mono text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/55 focus:outline-none focus:ring-2 focus:ring-orange-500/25 sm:text-base"
          />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {error ? (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-base text-rose-100">
              {error}
            </div>
          ) : null}

          {inspectorOpen && inspector ? (
            <section className="pulse-card overflow-hidden rounded-2xl border border-orange-500/15 bg-slate-950/50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
                <span className="font-mono text-xs text-orange-200/90">
                  Query inspector · {inspector.ms}ms · HTTP {inspector.status}
                </span>
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={() =>
                    void navigator.clipboard.writeText(inspector.preview)
                  }
                >
                  Copy response
                </button>
              </div>
              <pre className="max-h-[min(520px,50vh)] overflow-auto p-5 font-mono text-xs leading-relaxed text-zinc-400">
                {inspector.url}
                {"\n\n"}
                {inspector.preview}
              </pre>
            </section>
          ) : null}

          {mode === "logs" && logs.length > 0 ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-slate-950/30 px-5 py-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-zinc-200">
                  <span className="text-zinc-500">Lines </span>
                  <span className="font-semibold tabular-nums">
                    {logs.length}
                  </span>
                </span>
                <span className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
                  Errors{" "}
                  <span className="font-semibold tabular-nums">
                    {logLevelCounts.error}
                  </span>
                </span>
                <span className="rounded-xl border border-amber-500/15 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                  Warnings{" "}
                  <span className="font-semibold tabular-nums">
                    {logLevelCounts.warn}
                  </span>
                </span>
              </div>
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Level distribution
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  {(
                    [
                      ["error", logLevelCounts.error, "bg-rose-500/85"],
                      ["warn", logLevelCounts.warn, "bg-amber-500/80"],
                      ["info", logLevelCounts.info, "bg-cyan-600/75"],
                      ["debug", logLevelCounts.debug, "bg-violet-500/75"],
                      ["other", logLevelCounts.other, "bg-zinc-500/65"],
                    ] as const
                  ).map(([label, count, barColor]) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div
                        className="flex h-28 w-10 items-end justify-center rounded-lg bg-white/[0.05]"
                        title={`${label}: ${count}`}
                      >
                        <div
                          className={`w-full rounded-md ${barColor}`}
                          style={{
                            height:
                              count === 0
                                ? 0
                                : `${Math.max(12, (count / logHistMax) * 100)}%`,
                            minHeight: count > 0 ? 6 : 0,
                          }}
                        />
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {label}
                      </span>
                      <span className="text-sm tabular-nums font-medium text-zinc-200">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {mode === "metrics" && metricStats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Latest", metricStats.last],
                  ["Min", metricStats.min],
                  ["Max", metricStats.max],
                  ["Avg", metricStats.avg],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-orange-500/15 bg-orange-500/[0.06] px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-200/70">
                    {label}
                  </p>
                  <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-50 sm:text-2xl">
                    {Number.isFinite(val)
                      ? Math.abs(val) >= 10000
                        ? val.toExponential(2)
                        : val.toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          })
                      : "—"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {mode === "traces" && traceStats ? (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-zinc-200">
                Traces{" "}
                <span className="font-semibold tabular-nums">
                  {traceStats.count}
                </span>
              </span>
              <span className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
                With errors{" "}
                <span className="font-semibold tabular-nums">
                  {traceStats.errors}
                </span>
              </span>
              <span className="rounded-xl border border-cyan-500/15 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
                Avg duration{" "}
                <span className="font-semibold tabular-nums">
                  {traceStats.avgMs >= 1000
                    ? `${(traceStats.avgMs / 1000).toFixed(2)}s`
                    : `${Math.round(traceStats.avgMs)}ms`}
                </span>
              </span>
            </div>
          ) : null}

          {mode === "logs" ? (
            <section className="pulse-card flex min-h-[min(680px,65vh)] flex-1 flex-col overflow-hidden rounded-2xl p-0">
              <div className="border-b border-white/[0.06] px-5 py-3 text-sm font-medium text-zinc-400">
                {logs.length} lines · window {rangeKey}
              </div>
              <div className="flex-1 overflow-auto font-mono text-sm leading-relaxed">
                {logs.length === 0 && !loading ? (
                  <p className="p-10 text-base text-zinc-600">
                    Run a query to see log lines here. Click a row when attributes
                    exist to inspect JSON.
                  </p>
                ) : (
                  logs.map((row, i) => {
                    const rowKey = `${row.ts}-${i}`;
                    const expanded = expandedLogKeys.has(rowKey);
                    const hasAttrs =
                      row.attributes &&
                      Object.keys(row.attributes).length > 0;
                    return (
                      <div key={rowKey}>
                        <div
                          role={hasAttrs ? "button" : undefined}
                          tabIndex={hasAttrs ? 0 : undefined}
                          onClick={() => {
                            if (hasAttrs) toggleLogExpand(rowKey);
                          }}
                          onKeyDown={(e) => {
                            if (!hasAttrs) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleLogExpand(rowKey);
                            }
                          }}
                          className={`flex w-full flex-col items-start border-b border-white/[0.05] px-5 py-3 text-left transition hover:bg-white/[0.03] ${hasAttrs ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/25" : ""}`}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-zinc-500">
                              {format(new Date(row.ts), "HH:mm:ss.SSS")}
                            </span>
                            <span
                              className={
                                row.level === "error"
                                  ? "font-medium text-rose-400"
                                  : row.level === "warn"
                                    ? "font-medium text-amber-400"
                                    : "font-medium text-cyan-400/90"
                              }
                            >
                              [{row.level}]
                            </span>
                            <span className="text-zinc-100">{row.message}</span>
                            {hasAttrs ? (
                              <span className="text-[11px] text-zinc-600">
                                {expanded ? "▼ attrs" : "▶ attrs"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {expanded && hasAttrs ? (
                          <pre className="mx-5 mb-3 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-4 font-mono text-[12px] text-zinc-400">
                            {JSON.stringify(row.attributes, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ) : null}

          {mode === "metrics" ? (
            <section className="pulse-card flex min-h-[420px] flex-1 flex-col rounded-2xl p-6 sm:p-8">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="text-sm text-zinc-400">
                  <span className="font-medium text-zinc-200">
                    {series.length}
                  </span>{" "}
                  buckets · PromQL over last {rangeKey}
                </div>
                {promMeta !== null ? (
                  <details className="max-w-full rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 text-xs text-zinc-400 sm:max-w-[55%]">
                    <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Parsed query
                    </summary>
                    <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-500">
                      {JSON.stringify(promMeta, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
              <div className="min-h-[320px] w-full flex-1">
                {series.length === 0 && !loading ? (
                  <p className="text-base text-zinc-600">
                    Enter PromQL and Run query to render the series.
                  </p>
                ) : (
                  <div className="h-[min(480px,52vh)] w-full min-h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient
                            id="exploreFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={pulseChartSeries.amber}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor={pulseChartSeries.amber}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={pulseChartGridStroke}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={pulseChartAxisTick}
                          interval="preserveStartEnd"
                          minTickGap={28}
                        />
                        <YAxis tick={pulseChartAxisTick} width={52} />
                        <Tooltip contentStyle={pulseChartTooltipStyle} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="avg"
                          stroke={pulseChartSeries.amberLine}
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#exploreFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {mode === "traces" ? (
            <section className="pulse-card flex min-h-[min(640px,62vh)] flex-1 flex-col overflow-hidden rounded-2xl p-0">
              <div className="border-b border-white/[0.06] px-5 py-3 text-sm font-medium text-zinc-400">
                {traces.length} traces · window {rangeKey}
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-[15px]">
                  <thead className="sticky top-0 z-[1] bg-slate-950/98 text-[11px] uppercase tracking-wide text-zinc-500 backdrop-blur-sm">
                    <tr>
                      <th className="px-5 py-3">Trace</th>
                      <th className="px-5 py-3">Root</th>
                      <th className="px-5 py-3">Started</th>
                      <th className="px-5 py-3 text-right">Duration</th>
                      <th className="px-5 py-3 text-right">Spans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.map((t) => (
                      <tr
                        key={t.traceId}
                        className="border-t border-white/[0.05] hover:bg-white/[0.03]"
                      >
                        <td className="px-5 py-3.5 font-mono text-sm">
                          <Link
                            href={`/traces/${encodeURIComponent(t.traceId)}`}
                            className="font-medium text-orange-300 hover:text-orange-200 hover:underline"
                          >
                            {t.traceId.slice(0, 14)}…
                          </Link>
                          {t.errorCount > 0 ? (
                            <span className="ml-2 rounded-md bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">
                              errors
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[280px] px-5 py-3.5 text-zinc-200">
                          <span className="text-zinc-500">{t.rootService}</span>{" "}
                          · {t.rootName || "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-500">
                          {format(new Date(t.startTs), "MMM d HH:mm:ss")}
                        </td>
                        <td className="px-5 py-3.5 text-right text-base tabular-nums text-zinc-300">
                          {t.durationMs >= 1000
                            ? `${(t.durationMs / 1000).toFixed(2)}s`
                            : `${Math.round(t.durationMs)}ms`}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-zinc-500">
                          {t.spanCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {traces.length === 0 && !loading ? (
                  <p className="p-10 text-base text-zinc-600">
                    Run query to list traces for the service (or type a service
                    name in the query bar).
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-slate-950/45 p-5 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Recent queries
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {recent[mode].length === 0 ? (
                <li className="text-sm text-zinc-600">
                  Saved locally after each successful run.
                </li>
              ) : (
                recent[mode].map((rq) => (
                  <li key={rq}>
                    <button
                      type="button"
                      onClick={() => setQuery(rq)}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:border-orange-500/25 hover:text-orange-100"
                      title={rq}
                    >
                      <span className="line-clamp-3 font-mono text-[13px]">
                        {rq}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="border-t border-white/[0.06] pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Deep dives
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/logs"
                className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
              >
                Logs explorer →
              </Link>
              <Link
                href="/metrics"
                className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
              >
                Metrics explorer →
              </Link>
              <Link
                href="/traces"
                className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
              >
                Trace search →
              </Link>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-zinc-600">
            URLs update after each successful run so you can bookmark or share an
            exact Explore session.
          </p>
        </aside>
      </div>
    </div>
  );
}
