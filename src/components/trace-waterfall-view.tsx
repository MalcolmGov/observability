"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { TraceCopilotPanel } from "@/components/trace-copilot-panel";
import { computeCriticalPathSpanIds } from "@/lib/trace-critical-path";

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
  events: unknown[];
  links: unknown[];
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

// Hash service name → one of 8 teal/sky/emerald/amber palette colours
const SVC_PALETTE = [
  '#06d6c7', '#38bdf8', '#34d399', '#a78bfa',
  '#fb923c', '#f472b6', '#facc15', '#60a5fa',
];
function svcColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SVC_PALETTE[h % SVC_PALETTE.length]!;
}

// Timing bar colour: teal (fast) → amber (medium) → red (slow)
function timingBarColor(pct: number, isError: boolean): string {
  if (isError) return 'rgba(251,113,133,0.75)';
  if (pct < 0.25) return 'rgba(6,214,199,0.70)';
  if (pct < 0.55) return 'rgba(251,191,36,0.72)';
  return 'rgba(251,113,133,0.72)';
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
  const [attrQuery, setAttrQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<"waterfall" | "flame">(
    "waterfall",
  );

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

  const criticalIds = useMemo(() => {
    if (!data?.spans.length) return new Set<string>();
    return computeCriticalPathSpanIds(
      data.spans.map((s) => ({
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        durationMs: s.durationMs,
      })),
    );
  }, [data]);

  const rows = useMemo(() => {
    if (!data?.spans.length) return [];
    const fullById = new Map(data.spans.map((s) => [s.spanId, s]));
    const q = attrQuery.trim().toLowerCase();
    const spans =
      q === ""
        ? data.spans
        : data.spans.filter((s) => {
            const blob =
              `${s.name} ${s.service} ${JSON.stringify(s.attributes)}`.toLowerCase();
            return blob.includes(q);
          });

    const t0 = data.startTs;
    const range = Math.max(1, data.endTs - t0);

    let mapped = spans.map((s) => {
      const depth = spanDepth(s, fullById);
      const left = ((s.startTs - t0) / range) * 100;
      const width = (Math.max(1, s.durationMs) / range) * 100;
      return { s, depth, left, width };
    });

    if (layoutMode === "flame") {
      mapped = [...mapped].sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return b.s.durationMs - a.s.durationMs;
      });
    }

    return mapped;
  }, [attrQuery, data, layoutMode]);

  const rootSpan = useMemo(() => {
    if (!data?.spans.length) return null;
    return (
      data.spans.find((s) => !s.parentSpanId || s.parentSpanId === "") ??
      data.spans.reduce((a, b) => (a.startTs <= b.startTs ? a : b))
    );
  }, [data]);

  const logsWindowMs = useMemo(() => {
    if (!data) return 24 * 60 * 60 * 1000;
    const pad = 180_000;
    return Math.min(
      24 * 60 * 60 * 1000,
      Math.max(15 * 60 * 1000, data.durationMs + pad),
    );
  }, [data]);

  if (error && !data) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <div className="pulse-alert-error">{error}</div>
        <Link href="/traces" className="pulse-link mt-4 inline-block text-sm">
          ← Back to traces
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3 px-4 py-10 sm:px-8">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-[240px] animate-pulse rounded-lg bg-white/[0.04]" style={{ opacity: 1 - i * 0.1 }} />
            <div className="h-5 flex-1 animate-pulse rounded bg-white/[0.03]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <Link
            href="/traces"
            className="text-xs font-medium text-teal-400 hover:text-teal-300"
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
            {data.spans.length} spans · critical path{" "}
            <span
              className="pulse-mono-num"
              style={{ color: "var(--pulse-status-warning-fg)" }}
            >
              {criticalIds.size}
            </span>{" "}
            spans
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/logs?traceId=${encodeURIComponent(traceId)}&service=${encodeURIComponent(rootSpan?.service ?? "")}&windowMs=${String(logsWindowMs)}`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-white/10"
          >
            Logs for trace
          </Link>
          <Link
            href={`/map?sinceMs=${60 * 60 * 1000}`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            Service map
          </Link>
          <button
            type="button"
            onClick={() => void load("full")}
            className="pulse-btn-primary text-xs"
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

      <TraceCopilotPanel traceId={traceId} />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.06] bg-slate-950/35 px-4 py-3">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[10px] text-zinc-500">
          Attribute / name search
          <input
            value={attrQuery}
            onChange={(e) => setAttrQuery(e.target.value)}
            placeholder="db.statement, http.route, …"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <div className="pulse-segment">
          <button
            type="button"
            className={`pulse-segment-btn ${layoutMode === "waterfall" ? "pulse-segment-btn-active" : ""}`}
            onClick={() => setLayoutMode("waterfall")}
          >
            Waterfall
          </button>
          <button
            type="button"
            className={`pulse-segment-btn ${layoutMode === "flame" ? "pulse-segment-btn-active" : ""}`}
            onClick={() => setLayoutMode("flame")}
          >
            Flame
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/50">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-white/[0.06] bg-slate-950/90 px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-500">
            <span>Span</span>
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-sm bg-amber-400" /> Critical path
            </span>
            <span className="text-zinc-700">·</span>
            <span>{layoutMode === "flame" ? "flame sort" : "chronological"}</span>
          </div>
          <span className="font-mono text-[10px] tabular-nums text-zinc-600">
            {data.durationMs.toFixed(1)} ms total · {data.spans.length} spans
          </span>
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          {rows.map(({ s, depth, left, width }) => {
            const isCrit = criticalIds.has(s.spanId);
            const isErr = s.status === "error";
            const durPct = data.durationMs > 0 ? s.durationMs / data.durationMs : 0;
            const color = svcColor(s.service);
            return (
            <div
              key={s.spanId}
              className="flex items-stretch gap-2"
              style={isCrit ? { borderLeft: '2px solid rgba(251,191,36,0.55)', paddingLeft: 4, marginLeft: -6 } : {}}
            >
              <div
                className="w-[220px] shrink-0 pt-1 text-[11px] leading-snug sm:w-[280px]"
                style={{ paddingLeft: depth * 14 }}
              >
                {/* Service pill */}
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span
                    className="inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: color, boxShadow: `0 0 5px ${color}66` }}
                  />
                  <span className="font-semibold" style={{ color }}>{s.service}</span>
                  {s.peerService ? (
                    <span className="text-zinc-500"> → {s.peerService}</span>
                  ) : null}
                </div>
                <div className="text-zinc-400">
                  {s.name}{" "}
                  <span className="text-zinc-600">({s.kind}{s.status === "error" ? ", error" : "})"})</span>
                </div>
                <div className="tabular-nums text-zinc-600">{s.durationMs.toFixed(1)} ms</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    href={`/logs?traceId=${encodeURIComponent(traceId)}&service=${encodeURIComponent(s.service)}&windowMs=${String(logsWindowMs)}`}
                    className="text-[10px] font-medium text-teal-400 hover:text-teal-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Logs
                  </Link>
                  {Array.isArray(s.events) && s.events.length > 0 ? (
                    <span className="text-[10px] text-zinc-600">{s.events.length} events</span>
                  ) : null}
                  {Array.isArray(s.links) && s.links.length > 0 ? (
                    <span className="text-[10px] text-zinc-600">{s.links.length} links</span>
                  ) : null}
                </div>
              </div>
              <div className="relative min-h-9 min-w-0 flex-1 rounded-lg bg-slate-950/45">
                <div
                  className="pulse-transition absolute top-1/2 h-5 -translate-y-1/2 rounded"
                  style={{
                    background: timingBarColor(durPct, isErr),
                    boxShadow: isCrit ? '0 0 0 1.5px rgba(251,191,36,0.6)' : undefined,
                    left: `${left}%`,
                    width: `${Math.max(width, 0.35)}%`,
                  }}
                  title={`${s.name} · ${s.durationMs.toFixed(1)}ms (${(durPct * 100).toFixed(0)}% of trace)`}
                />
              </div>
            </div>
          )})}
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
