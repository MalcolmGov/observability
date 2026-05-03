"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";

type Span = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  name: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  kind: string;
  status: string;
  peerService: string | null;
  attributes: Record<string, unknown>;
};

function spanDepth(s: Span, byId: Map<string, Span>): number {
  let d = 0;
  let parentId: string | null | undefined = s.parentSpanId;
  const visited = new Set<string>([s.spanId]);
  while (parentId) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    d++;
    const p = byId.get(parentId);
    parentId = p?.parentSpanId ?? null;
  }
  return d;
}

export function TraceWaterfallView({ traceId }: { traceId: string }) {
  const [data, setData] = useState<{
    startTs: number;
    endTs: number;
    durationMs: number;
    spans: Span[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async (mode: "full" | "poll" = "full") => {
    const quiet = mode === "poll";
    if (!quiet) setError(null);
    const res = await fetch(
      `/api/v1/traces/${encodeURIComponent(traceId)}`,
    );
    if (!res.ok) {
      if (!quiet) {
        setData(null);
        setError("Trace not found");
      }
      return;
    }
    const json = (await res.json()) as {
      startTs: number;
      endTs: number;
      durationMs: number;
      spans: Span[];
    };
    setData(json);
  }, [traceId]);

  useEffect(() => {
    void load("full");
  }, [load]);

  useLiveRefresh(live, 5000, () => void load("poll"));

  const rows = useMemo(() => {
    if (!data?.spans.length) return [];
    const byId = new Map(data.spans.map((s) => [s.spanId, s]));
    const t0 = data.startTs;
    const range = Math.max(1, data.endTs - t0);

    return data.spans.map((s) => {
      const depth = spanDepth(s, byId);
      const left = ((s.startTs - t0) / range) * 100;
      const width = (Math.max(1, s.durationMs) / range) * 100;
      return { s, depth, left, width };
    });
  }, [data]);

  const rootSpan = useMemo(() => {
    if (!data?.spans.length) return null;
    return (
      data.spans.find((s) => !s.parentSpanId || s.parentSpanId === "") ??
      data.spans.reduce((a, b) => (a.startTs <= b.startTs ? a : b))
    );
  }, [data]);

  if (error && !data) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <p className="text-sm text-red-300">{error}</p>
        <Link
          href="/traces"
          className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Back to traces
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-10 sm:px-8 text-sm text-zinc-500">
        Loading trace…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <Link
            href="/traces"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            ← Traces
          </Link>
          <h1 className="mt-3 text-xl font-semibold text-zinc-50">
            Trace waterfall
          </h1>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            {data.spans[0]?.traceId ?? traceId}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            {format(new Date(data.startTs), "PPpp")} ·{" "}
            <span className="tabular-nums">{data.durationMs} ms</span> ·{" "}
            {data.spans.length} spans
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/logs?traceId=${encodeURIComponent(traceId)}&service=${encodeURIComponent(rootSpan?.service ?? "")}`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-white/10"
          >
            Logs for trace
          </Link>
          <Link
            href={`/map`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            Service map
          </Link>
          <button
            type="button"
            onClick={() => void load("full")}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400"
          >
            Refresh
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20"
            />
            Live (5s)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
          <span>Span</span>
          <span>Timeline (relative)</span>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map(({ s, depth, left, width }) => (
            <div key={s.spanId} className="flex items-stretch gap-2">
              <div
                className="w-[220px] shrink-0 pt-1 text-[11px] leading-snug sm:w-[280px]"
                style={{ paddingLeft: depth * 14 }}
              >
                <div className="font-medium text-zinc-200">
                  {s.service}
                  {s.peerService ? (
                    <span className="text-zinc-500">
                      {" "}
                      → {s.peerService}
                    </span>
                  ) : null}
                </div>
                <div className="text-zinc-500">
                  {s.name}{" "}
                  <span className="text-zinc-600">
                    ({s.kind}
                    {s.status === "error" ? ", error" : ""})
                  </span>
                </div>
                <div className="tabular-nums text-zinc-600">
                  {s.durationMs.toFixed(1)} ms
                </div>
              </div>
              <div className="relative min-h-9 min-w-0 flex-1 rounded-lg bg-slate-950/45">
                <div
                  className={`absolute top-1/2 h-5 -translate-y-1/2 rounded ${
                    s.status === "error"
                      ? "bg-red-500/70"
                      : s.kind === "client"
                        ? "bg-amber-400/70"
                        : "bg-indigo-400/80"
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.35)}%`,
                  }}
                  title={`${s.name} · ${s.durationMs.toFixed(1)}ms`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Raw spans
        </h2>
        <pre className="mt-3 max-h-48 overflow-auto text-[10px] leading-relaxed text-zinc-500">
          {JSON.stringify(data.spans, null, 2)}
        </pre>
      </section>
    </div>
  );
}
