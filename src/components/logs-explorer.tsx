"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { LOG_ATTR_KEY_RE } from "@/lib/log-attr-filter";
import { traceIdFromAttributes } from "@/lib/trace-id";
import type { NlQueryApiResponse } from "@/lib/nl-query-schema";
import { NlQueryPanel } from "@/components/nl-query-panel";

type LogRow = {
  ts: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
};

const LEVELS = ["all", "error", "warn", "info", "debug"] as const;

const LOG_WINDOWS = [
  { id: "15m", label: "15m", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

type FacetsPayload = {
  total: number;
  sampleSize?: number;
  levels: { level: string; count: number }[];
  topMessages: { message: string; count: number }[];
  attributeKeys?: { key: string; count: number }[];
};

export function LogsExplorer() {
  const searchParams = useSearchParams();
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [logWindowMs, setLogWindowMs] = useState(LOG_WINDOWS[3].ms);
  const [traceFilter, setTraceFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [attrKeyInput, setAttrKeyInput] = useState("");
  const [attrKey, setAttrKey] = useState("");
  const [attrValueInput, setAttrValueInput] = useState("");
  const [attrValue, setAttrValue] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [facets, setFacets] = useState<FacetsPayload | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/v1/services");
    if (!res.ok) throw new Error("Failed to load services");
    const data = (await res.json()) as { services: string[] };
    setServices(data.services);
    setService((prev) => prev || (data.services[0] ?? ""));
  }, []);

  const loadLogs = useCallback(async () => {
    if (!service) {
      setLogs([]);
      return;
    }
    const end = Date.now();
    const start = end - logWindowMs;
    const params = new URLSearchParams({
      service,
      limit: "200",
      start: String(start),
      end: String(end),
    });
    if (q) params.set("q", q);
    if (level && level !== "all") params.set("level", level);
    if (traceFilter.trim()) params.set("traceId", traceFilter.trim());
    const ak = attrKey.trim();
    if (ak && LOG_ATTR_KEY_RE.test(ak)) {
      params.set("attrKey", ak);
      const av = attrValue.trim();
      if (av) params.set("attrValue", av);
    }
    const res = await fetch(`/api/v1/query/logs?${params}`);
    if (!res.ok) throw new Error("Failed to load logs");
    const data = (await res.json()) as { logs: LogRow[] };
    setLogs(data.logs);
  }, [attrKey, attrValue, level, logWindowMs, q, service, traceFilter]);

  const loadFacets = useCallback(async () => {
    if (!service) {
      setFacets(null);
      return;
    }
    const end = Date.now();
    const start = end - logWindowMs;
    const params = new URLSearchParams({
      service,
      start: String(start),
      end: String(end),
    });
    if (q) params.set("q", q);
    if (traceFilter.trim()) params.set("traceId", traceFilter.trim());
    const ak = attrKey.trim();
    if (ak && LOG_ATTR_KEY_RE.test(ak)) {
      params.set("attrKey", ak);
      const av = attrValue.trim();
      if (av) params.set("attrValue", av);
    }
    const res = await fetch(`/api/v1/query/logs/facets?${params}`);
    if (!res.ok) {
      setFacets(null);
      return;
    }
    const data = (await res.json()) as FacetsPayload;
    setFacets(data);
  }, [attrKey, attrValue, logWindowMs, q, service, traceFilter]);

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
    const t = searchParams.get("traceId");
    if (t) setTraceFilter(t);
    const s = searchParams.get("service");
    if (s) setService(s);
    const qParam = searchParams.get("q");
    if (qParam) {
      setQInput(qParam);
      setQ(qParam);
    }
    const lv = searchParams.get("level");
    if (lv && (LEVELS as readonly string[]).includes(lv)) setLevel(lv);
    const ak = searchParams.get("attrKey");
    if (ak) {
      setAttrKeyInput(ak);
      setAttrKey(ak);
    }
    const av = searchParams.get("attrValue");
    if (av) {
      setAttrValueInput(av);
      setAttrValue(av);
    }
    const wm = searchParams.get("windowMs");
    if (wm) {
      const n = Number(wm);
      if (Number.isFinite(n) && n > 0) setLogWindowMs(n);
    }
  }, [searchParams]);

  const applyNlLogs = useCallback((plan: NlQueryApiResponse) => {
    if (plan.kind !== "logs" || !plan.logs) return;
    setService(plan.logs.service);
    setLogWindowMs(plan.time.windowMs);
    const qv = plan.logs.q ?? "";
    setQInput(qv);
    setQ(qv);
    setLevel(plan.logs.level ?? "all");
    setTraceFilter(plan.logs.traceId ?? "");
    const ak = plan.logs.attrKey ?? "";
    setAttrKeyInput(ak);
    setAttrKey(ak);
    const av = plan.logs.attrValue ?? "";
    setAttrValueInput(av);
    setAttrValue(av);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    const t = window.setTimeout(() => setAttrKey(attrKeyInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [attrKeyInput]);

  useEffect(() => {
    const t = window.setTimeout(() => setAttrValue(attrValueInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [attrValueInput]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadLogs();
        await loadFacets();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadFacets, loadLogs]);

  useLiveRefresh(live, 10_000, () => {
    void loadLogs().catch(() => {});
    void loadFacets().catch(() => {});
  });

  const levelSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      m.set(l.level, (m.get(l.level) ?? 0) + 1);
    }
    return m;
  }, [logs]);

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
      await loadLogs();
      await loadFacets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Log explorer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Facets (severity slices + top messages), search, time windows, and
            trace correlation — closer to Datadog Log Explorer navigation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded border-white/20"
            />
            Live tail (10s)
          </label>
          <button
            type="button"
            onClick={() => void seedDemo()}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Load demo data
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-lg shadow-slate-950/25">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex min-w-[180px] flex-col gap-1 text-xs text-zinc-500">
          Service
          <select
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {services.length === 0 ? (
              <option value="">No telemetry</option>
            ) : (
              services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex w-[100px] flex-col gap-1 text-xs text-zinc-500">
          Window
          <select
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
            value={logWindowMs}
            onChange={(e) => setLogWindowMs(Number(e.target.value))}
          >
            {LOG_WINDOWS.map((w) => (
              <option key={w.id} value={w.ms}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-zinc-500">
          Search
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="webhook, trace_id, SKU…"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <label className="flex w-40 min-w-0 flex-col gap-1 text-xs text-zinc-500">
          Trace ID
          <input
            value={traceFilter}
            onChange={(e) => setTraceFilter(e.target.value)}
            placeholder="optional"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <label className="flex min-w-[140px] max-w-[200px] flex-col gap-1 text-xs text-zinc-500">
          Attr key
          <input
            value={attrKeyInput}
            onChange={(e) => setAttrKeyInput(e.target.value)}
            placeholder="e.g. trace_id"
            title="Structured log attribute key (json_each filter)"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <label className="flex min-w-0 max-w-[180px] flex-col gap-1 text-xs text-zinc-500">
          Attr value
          <input
            value={attrValueInput}
            onChange={(e) => setAttrValueInput(e.target.value)}
            placeholder="substring (optional)"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Level</span>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize ring-1 transition ${
                  level === lv
                    ? "bg-indigo-500/25 text-indigo-100 ring-indigo-400/50"
                    : "bg-slate-950/30 text-zinc-400 ring-white/10 hover:text-zinc-200"
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 lg:ml-auto lg:text-right">
          {loading ? "Scanning…" : `${logs.length} lines`}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {[...levelSummary.entries()].map(([k, v]) => (
              <span key={k} className="text-zinc-400">
                {k}:{v}
              </span>
            ))}
          </div>
        </div>
        </div>
        {attrKeyInput.trim().length > 0 &&
        !LOG_ATTR_KEY_RE.test(attrKeyInput.trim()) ? (
          <p className="text-[11px] text-amber-200/90">
            Attribute key must match{" "}
            <code className="text-zinc-500">a-zA-Z</code> start, up to 64 chars
            of <code className="text-zinc-500">[a-zA-Z0-9_.-]</code> — filter not
            applied until valid.
          </p>
        ) : null}
      </div>

      <NlQueryPanel page="logs" onApplyLogs={applyNlLogs} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 rounded-2xl border border-white/10 bg-slate-950/50 p-4 lg:w-60">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Facets
          </div>
          {!facets ? (
            <p className="mt-2 text-xs text-zinc-600">Select a service…</p>
          ) : (
            <>
              <div className="mt-2 text-[11px] text-zinc-500">
                {facets.total.toLocaleString()} events
                {facets.sampleSize != null
                  ? ` · sampled ${facets.sampleSize} for keys`
                  : ""}{" "}
                <span className="text-zinc-600">(pre-level)</span>
              </div>
              <div className="mt-3 space-y-1">
                <div className="text-[10px] font-medium uppercase text-zinc-600">
                  Level
                </div>
                {facets.levels.map((f) => (
                  <button
                    key={f.level}
                    type="button"
                    onClick={() =>
                      setLevel(
                        level === f.level && f.level !== "all"
                          ? "all"
                          : f.level,
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                      level === f.level
                        ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/40"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    <span className="capitalize">{f.level}</span>
                    <span className="tabular-nums text-zinc-500">
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
              {(facets.attributeKeys?.length ?? 0) > 0 ? (
                <div className="mt-4 space-y-1">
                  <div className="text-[10px] font-medium uppercase text-zinc-600">
                    Attribute keys
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {facets.attributeKeys!.map((ak) => (
                      <button
                        key={ak.key}
                        type="button"
                        title={`Filter by attribute “${ak.key}”`}
                        onClick={() => {
                          setQInput("");
                          setQ("");
                          setAttrKeyInput(ak.key);
                          setAttrKey(ak.key);
                        }}
                        className="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-[10px] text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                      >
                        <span className="truncate font-mono text-zinc-300">
                          {ak.key}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-500">
                          {ak.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {facets.topMessages.length > 0 ? (
                <div className="mt-4 space-y-1">
                  <div className="text-[10px] font-medium uppercase text-zinc-600">
                    Top messages
                  </div>
                  <ul className="max-h-40 space-y-2 overflow-y-auto text-[10px] text-zinc-400">
                    {facets.topMessages.map((m, i) => (
                      <li key={i} className="leading-snug">
                        <span className="text-zinc-500">{m.count}×</span>{" "}
                        <span className="text-zinc-300">{m.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/25 font-mono text-[11px] shadow-inner shadow-slate-950/40">
        <div className="grid grid-cols-[88px_64px_minmax(0,1fr)_72px_52px] gap-2 border-b border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <div>Time</div>
          <div>Level</div>
          <div>Message</div>
          <div className="text-center">Trace</div>
          <div className="text-right">Ctx</div>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-zinc-500">
              No logs match. Try another query or ingest pipeline.
            </div>
          ) : (
            logs.map((l, idx) => (
              <div key={`${l.ts}-${idx}`} className="border-b border-white/5">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [idx]: !e[idx] }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded((ex) => ({ ...ex, [idx]: !ex[idx] }));
                    }
                  }}
                  className="grid w-full cursor-pointer grid-cols-[88px_64px_minmax(0,1fr)_72px_52px] gap-2 px-3 py-2 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-indigo-500/50"
                >
                  <div className="text-zinc-500">
                    {format(new Date(l.ts), "HH:mm:ss")}
                  </div>
                  <div
                    className={
                      l.level === "error"
                        ? "text-red-400"
                        : l.level === "warn"
                          ? "text-amber-300"
                          : "text-emerald-400"
                    }
                  >
                    {l.level}
                  </div>
                  <div className="truncate text-zinc-200">{l.message}</div>
                  <div className="flex items-center justify-center">
                    {(() => {
                      const tid = traceIdFromAttributes(l.attributes);
                      return tid ? (
                        <Link
                          href={`/traces/${encodeURIComponent(tid)}`}
                          className="text-indigo-400 hover:text-indigo-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      );
                    })()}
                  </div>
                  <div className="text-right text-indigo-300/90">
                    {Object.keys(l.attributes ?? {}).length ? "JSON" : "—"}
                  </div>
                </div>
                {expanded[idx] ? (
                  <div className="mx-3 mb-2 rounded-lg bg-slate-950/80 p-3 font-mono text-[10px] text-zinc-400">
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(l.attributes, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
