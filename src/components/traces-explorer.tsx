"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import type { NlQueryApiResponse } from "@/lib/nl-query-schema";
import { NlQueryPanel } from "@/components/nl-query-panel";
import { SavedViewsToolbar } from "@/components/saved-views-toolbar";

const LOOKBACK_OPTIONS = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

type TraceRow = {
  traceId: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  spanCount: number;
  errorCount: number;
  rootService: string;
  rootName: string;
};

export function TracesExplorer() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [minDurationMs, setMinDurationMs] = useState("");
  const [lookbackMs, setLookbackMs] = useState(24 * 60 * 60 * 1000);
  const [live, setLive] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/v1/services");
    if (!res.ok) throw new Error("Failed to load services");
    const data = (await res.json()) as { services: string[] };
    setServices(data.services);
    setService((p) => p || (data.services[0] ?? ""));
  }, []);

  const fetchTraces = useCallback(async () => {
    const since = Date.now() - lookbackMs;
    const q = new URLSearchParams({
      limit: "80",
      sinceMs: String(since),
    });
    if (service) q.set("service", service);
    if (errorsOnly) q.set("errorsOnly", "1");
    const md = Number(minDurationMs);
    if (Number.isFinite(md) && md > 0) q.set("minDurationMs", String(md));
    const res = await fetch(`/api/v1/traces?${q}`);
    if (!res.ok) throw new Error("Failed to load traces");
    const data = (await res.json()) as { traces: TraceRow[] };
    setTraces(data.traces);
  }, [service, errorsOnly, minDurationMs, lookbackMs]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchTraces();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchTraces]);

  useLiveRefresh(live, 10_000, () => {
    void fetchTraces().catch(() => {});
  });

  useEffect(() => {
    void (async () => {
      try {
        await loadServices();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [loadServices]);

  useEffect(() => {
    const s = searchParams.get("service");
    if (s) setService(s);
    const errors = searchParams.get("errors");
    if (errors === "1") setErrorsOnly(true);
    const minMs = searchParams.get("minMs");
    if (minMs) setMinDurationMs(minMs);
    const lb = searchParams.get("lookbackMs");
    if (lb) {
      const n = Number(lb);
      if (Number.isFinite(n) && n > 0) setLookbackMs(n);
    }
  }, [searchParams]);

  const applyNlTraces = useCallback((plan: NlQueryApiResponse) => {
    if (plan.kind !== "traces" || !plan.traces) return;
    setService(plan.traces.service ?? "");
    setErrorsOnly(plan.traces.errorsOnly === true);
    setMinDurationMs(
      plan.traces.minDurationMs != null ? String(plan.traces.minDurationMs) : "",
    );
    setLookbackMs(plan.traces.lookbackMs);
  }, []);

  const applySavedState = useCallback((state: Record<string, unknown>) => {
    const svc = state.service;
    if (typeof svc === "string") setService(svc);
    const eo = state.errorsOnly;
    if (typeof eo === "boolean") setErrorsOnly(eo);
    const md = state.minDurationMs;
    if (typeof md === "string") setMinDurationMs(md);
    else if (md === null || md === undefined) setMinDurationMs("");
    const lb = state.lookbackMs;
    if (typeof lb === "number" && Number.isFinite(lb) && lb > 0) {
      setLookbackMs(lb);
    }
    const lv = state.live;
    if (typeof lv === "boolean") setLive(lv);
  }, []);

  const copyTracesShareLink = useCallback(async () => {
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (errorsOnly) params.set("errors", "1");
    const md = Number(minDurationMs);
    if (Number.isFinite(md) && md > 0) params.set("minMs", String(md));
    params.set("lookbackMs", String(lookbackMs));
    const url = `${window.location.origin}/traces?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopiedShare(true);
    window.setTimeout(() => setCopiedShare(false), 2000);
  }, [errorsOnly, lookbackMs, minDurationMs, service]);

  async function seedDemo() {
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/seed", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Seed failed");
      }
      await loadServices();
      setService("checkout-api");
      await fetchTraces();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Traces
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Explore distributed traces, drill into span waterfalls, and follow
            peer edges into the service map.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => void copyTracesShareLink()}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10"
          >
            {copiedShare ? "Copied link" : "Copy shareable link"}
          </button>
          <SavedViewsToolbar
            page="traces"
            getState={() => ({
              service,
              errorsOnly,
              minDurationMs,
              lookbackMs,
              live,
            })}
            applyState={applySavedState}
          />
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Service filter
            <select
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Min duration (ms)
            <input
              type="number"
              min={0}
              placeholder="any"
              className="w-28 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={minDurationMs}
              onChange={(e) => setMinDurationMs(e.target.value)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => setErrorsOnly(e.target.checked)}
              className="rounded border-white/20"
            />
            Errors only
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Lookback
            <select
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={String(lookbackMs)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) setLookbackMs(n);
              }}
            >
              {LOOKBACK_OPTIONS.map((o) => (
                <option key={o.ms} value={String(o.ms)}>
                  {o.label}
                </option>
              ))}
              {!LOOKBACK_OPTIONS.some((o) => o.ms === lookbackMs) ? (
                <option value={String(lookbackMs)}>
                  Other ({Math.round(lookbackMs / 3600000)}h)
                </option>
              ) : null}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20"
            />
            Live (10s)
          </label>
          <button
            type="button"
            onClick={() => void seedDemo()}
            className="self-end rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Load demo data
          </button>
        </div>
      </header>

      {error ? <div className="pulse-alert-error">{error}</div> : null}

      <NlQueryPanel page="traces" onApplyTraces={applyNlTraces} />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 shadow-lg shadow-slate-950/25">
        <div className="grid grid-cols-[minmax(0,1.2fr)_80px_72px_72px_minmax(0,0.7fr)] gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <div>Root / trace</div>
          <div>Spans</div>
          <div>Errors</div>
          <div>Duration</div>
          <div>Started</div>
        </div>
        <div className="max-h-[min(70vh,560px)] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-zinc-500">
              Loading traces…
            </div>
          ) : traces.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-zinc-500">
              No traces in window. Ingest spans via{" "}
              <code className="text-indigo-300">/api/v1/ingest/traces</code> or
              load the demo.
            </div>
          ) : (
            traces.map((t) => (
              <Link
                key={t.traceId}
                href={`/traces/${encodeURIComponent(t.traceId)}`}
                className="grid grid-cols-[minmax(0,1.2fr)_80px_72px_72px_minmax(0,0.7fr)] gap-2 border-b border-white/5 px-4 py-3 text-sm transition hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-100">
                    {t.rootService}{" "}
                    <span className="text-zinc-500">· {t.rootName}</span>
                  </div>
                  <div className="truncate font-mono text-[11px] text-zinc-500">
                    {t.traceId}
                  </div>
                </div>
                <div className="text-zinc-300">{t.spanCount}</div>
                <div
                  className="pulse-mono-num font-medium"
                  style={{
                    color:
                      t.errorCount > 0
                        ? "var(--pulse-status-danger-fg)"
                        : "var(--pulse-status-success-fg)",
                  }}
                >
                  {t.errorCount}
                </div>
                <div className="tabular-nums text-zinc-300">
                  {t.durationMs.toFixed(0)} ms
                </div>
                <div className="text-[11px] text-zinc-500">
                  {format(new Date(t.startTs), "MMM d HH:mm:ss")}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 text-xs text-zinc-500">
        <span className="font-semibold text-zinc-300">Ingest shape</span>:{" "}
        <code className="text-indigo-300">POST /api/v1/ingest/traces</code> with
        a <code className="text-zinc-300">spans</code> array (
        <code className="text-zinc-300">trace_id</code>,{" "}
        <code className="text-zinc-300">span_id</code>, optional{" "}
        <code className="text-zinc-300">parent_span_id</code>, timing,{" "}
        <code className="text-zinc-300">peer_service</code> for client calls).
      </section>
    </div>
  );
}
