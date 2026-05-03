"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import {
  pulseChartGridStroke,
  pulseChartSeries,
  pulseChartTooltipStyle,
} from "@/lib/chart-theme";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type OverviewPayload = {
  generatedAtMs: number;
  windowMs?: number;
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

function MiniSeries({
  title,
  subtitle,
  data,
  color,
  gradientId,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: number }[];
  color: string;
  gradientId: string;
}) {
  return (
    <div className="pulse-card-soft p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-zinc-300">{title}</div>
          <div className="text-[10px] text-zinc-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-3 h-28">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-zinc-500">
            No points
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={pulseChartGridStroke} />
              <XAxis dataKey="label" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={pulseChartTooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function healthDot(health: OverviewPayload["services"][0]["health"]) {
  if (health === "critical") return "bg-red-500 shadow shadow-red-500/40";
  if (health === "degraded") return "bg-amber-400 shadow shadow-amber-400/30";
  return "bg-emerald-400 shadow shadow-emerald-400/25";
}

export function OverviewView() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seriesA, setSeriesA] = useState<{ label: string; value: number }[]>(
    [],
  );
  const [seriesB, setSeriesB] = useState<{ label: string; value: number }[]>(
    [],
  );
  const [depEdges, setDepEdges] = useState<
    { source: string; target: string; weight: number }[]
  >([]);
  const [live, setLive] = useState(false);

  const load = useCallback(async (mode: "full" | "poll" = "full") => {
    const quiet = mode === "poll";
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/v1/overview");
      if (!res.ok) throw new Error("Overview request failed");
      const json = (await res.json()) as OverviewPayload;
      setData(json);

      const mapRes = await fetch(
        `/api/v1/service-map?sinceMs=${json.generatedAtMs - 60 * 60 * 1000}`,
      );
      if (mapRes.ok) {
        const mj = (await mapRes.json()) as {
          edges: { source: string; target: string; weight: number }[];
        };
        setDepEdges(mj.edges.slice(0, 8));
      } else {
        setDepEdges([]);
      }

      const svc =
        json.services.find((s) => s.service === "checkout-api")?.service ??
        json.services[0]?.service;
      if (!svc) {
        setSeriesA([]);
        setSeriesB([]);
        return;
      }
      const end = json.generatedAtMs;
      const start = end - 60 * 60 * 1000;
      const q = (name: string) =>
        `/api/v1/query/metrics?name=${encodeURIComponent(name)}&service=${encodeURIComponent(svc)}&start=${start}&end=${end}&bucketMs=60000`;

      const [ra, rb] = await Promise.all([
        fetch(q("http.server.request_duration_ms")),
        fetch(q("http.server.requests")),
      ]);
      if (!ra.ok || !rb.ok) {
        setSeriesA([]);
        setSeriesB([]);
        return;
      }
      const ja = (await ra.json()) as { series: { t: number; value: number }[] };
      const jb = (await rb.json()) as { series: { t: number; value: number }[] };
      setSeriesA(
        ja.series.map((p) => ({
          label: format(new Date(p.t), "HH:mm"),
          value: p.value,
        })),
      );
      setSeriesB(
        jb.series.map((p) => ({
          label: format(new Date(p.t), "HH:mm"),
          value: p.value,
        })),
      );
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useLiveRefresh(live, 15_000, () => void load("poll"));

  useEffect(() => {
    void load("full");
  }, [load]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const t = data.totals;
    return [
      {
        label: "Services (1h)",
        value: String(t.services),
        hint: "With telemetry in window",
      },
      {
        label: "Metric points (1h)",
        value: t.metricPoints1h.toLocaleString(),
        hint: "Ingested samples",
      },
      {
        label: "Log lines (1h)",
        value: t.logLines1h.toLocaleString(),
        hint: "Structured events",
      },
      {
        label: "Errors (1h)",
        value: t.errorLogs1h.toLocaleString(),
        hint: "error level logs",
      },
    ];
  }, [data]);

  async function seedDemo() {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <div className="pulse-page-head border-white/[0.06]">
        <div>
          <h1 className="pulse-h1 text-2xl sm:text-[1.65rem]">
            Overview
          </h1>
          <p className="pulse-lead mt-1 max-w-2xl">
            Fleet health, ingest volume, and golden signals for your first
            service. Wire more ingestors to grow these cards automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 shadow-inner shadow-slate-950/25">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20"
            />
            Live (15s)
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
            onClick={() => void seedDemo()}
            disabled={loading}
            className="pulse-btn-primary text-sm disabled:opacity-50"
          >
            Load demo data
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="pulse-card p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {k.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {loading && !data ? "—" : k.value}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{k.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          <MiniSeries
            title="Latency (avg)"
            subtitle="http.server.request_duration_ms · 1h"
            data={seriesA}
            color={pulseChartSeries.violetSoft}
            gradientId="mini-latency"
          />
          <MiniSeries
            title="Throughput"
            subtitle="http.server.requests · 1h"
            data={seriesB}
            color={pulseChartSeries.emerald}
            gradientId="mini-rpm"
          />
        </div>

        <div className="pulse-card p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Service health
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                Errors, warnings, and ingest freshness across telemetry types.
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
              LIVE
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {!data?.services.length ? (
              <li className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                No services in the last hour. Seed demo or start ingesting.
              </li>
            ) : (
              data.services.map((s) => (
                <li
                  key={s.service}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span
                    className={`inline-flex size-2.5 shrink-0 rounded-full ${healthDot(s.health)}`}
                    title={s.health}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {s.service}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {s.metrics1h.toLocaleString()} pts ·{" "}
                      {s.logs1h.toLocaleString()} logs · {s.errors1h} err ·{" "}
                      {s.warns1h} warn
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-zinc-500">
                    {s.receiving ? (
                      <span className="text-emerald-400/90">Receiving</span>
                    ) : (
                      <span className="text-zinc-500">Quiet</span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="pulse-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Dependencies (1h)
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Top edges from traces. Open the full map for the complete graph.
            </p>
          </div>
          <Link
            href="/map"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            View service map →
          </Link>
        </div>
        {depEdges.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No cross-service edges yet. Seed demo traces or ingest client spans
            with <code className="text-zinc-400">peer_service</code>.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {depEdges.map((e) => (
              <li
                key={`${e.source}-${e.target}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span className="font-medium text-indigo-200">{e.source}</span>
                <span className="text-zinc-600">→</span>
                <span className="font-medium text-emerald-200">{e.target}</span>
                <span className="ml-auto tabular-nums text-zinc-500">
                  {e.weight} spans
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pulse-card p-5">
        <h2 className="text-sm font-semibold text-white">Quick ingest</h2>
        <p className="mt-2 text-xs text-zinc-500">
          POST JSON to{" "}
          <code className="text-indigo-300">/api/v1/ingest/metrics</code>,{" "}
          <code className="text-indigo-300">/api/v1/ingest/logs</code>, and{" "}
          <code className="text-indigo-300">/api/v1/ingest/traces</code>, or send
          OTLP/HTTP JSON (gzip supported) to{" "}
          <code className="text-indigo-300">/api/v1/ingest/otlp/v1/*</code> for
          OpenTelemetry Collector agents. Rules in Alerts compare rolling
          averages to your thresholds.
        </p>
      </section>
    </div>
  );
}
