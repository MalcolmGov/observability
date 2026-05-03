"use client";

import type { NlQueryApiResponse } from "@/lib/nl-query-schema";
import { planNlQueryAction } from "@/app/actions/nl-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type PageHint = "logs" | "metrics" | "traces";

type Props = {
  page: PageHint;
  className?: string;
  onApplyLogs?: (plan: NlQueryApiResponse) => void;
  onApplyMetrics?: (plan: NlQueryApiResponse) => void;
  onApplyTraces?: (plan: NlQueryApiResponse) => void;
};

export function NlQueryPanel({
  page,
  className = "",
  onApplyLogs,
  onApplyMetrics,
  onApplyTraces,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReasoning, setLastReasoning] = useState<string | null>(null);
  const [lastWarnings, setLastWarnings] = useState<string[] | null>(null);

  const apply = useCallback(
    (plan: NlQueryApiResponse) => {
      switch (plan.kind) {
        case "logs":
          onApplyLogs?.(plan);
          break;
        case "metrics":
          onApplyMetrics?.(plan);
          break;
        case "traces":
          onApplyTraces?.(plan);
          break;
        default:
          break;
      }
    },
    [onApplyLogs, onApplyMetrics, onApplyTraces],
  );

  async function run() {
    setError(null);
    setLastReasoning(null);
    setLastWarnings(null);
    setBusy(true);
    try {
      const res = await planNlQueryAction(input, page);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { plan } = res;
      setLastReasoning(plan.reasoning);
      setLastWarnings(plan.warnings.length ? plan.warnings : null);

      if (plan.kind === page) {
        apply(plan);
        setOpen(false);
        setInput("");
        return;
      }

      const q = new URLSearchParams();
      if (plan.kind === "metrics" && plan.metrics) {
        q.set("service", plan.metrics.service);
        q.set("metric", plan.metrics.metricName);
        q.set("range", plan.metrics.rangeKey);
        router.push(`/metrics?${q}`);
        setOpen(false);
        setInput("");
        return;
      }
      if (plan.kind === "traces" && plan.traces) {
        if (plan.traces.service) q.set("service", plan.traces.service);
        if (plan.traces.errorsOnly) q.set("errors", "1");
        if (plan.traces.minDurationMs)
          q.set("minMs", String(plan.traces.minDurationMs));
        q.set("lookbackMs", String(plan.traces.lookbackMs));
        router.push(`/traces?${q}`);
        setOpen(false);
        setInput("");
        return;
      }
      if (plan.kind === "logs" && plan.logs) {
        const lq = new URLSearchParams();
        lq.set("service", plan.logs.service);
        if (plan.logs.q) lq.set("q", plan.logs.q);
        if (plan.logs.level) lq.set("level", plan.logs.level);
        if (plan.logs.traceId) lq.set("traceId", plan.logs.traceId);
        if (plan.logs.attrKey) lq.set("attrKey", plan.logs.attrKey);
        if (plan.logs.attrValue) lq.set("attrValue", plan.logs.attrValue);
        lq.set("windowMs", String(plan.time.windowMs));
        router.push(`/logs?${lq}`);
        setOpen(false);
        setInput("");
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-xl border border-indigo-500/25 bg-indigo-950/20 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-indigo-100/95 hover:bg-indigo-500/10"
      >
        <span>Natural language query</span>
        <span className="text-indigo-300/80">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-indigo-500/20 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-snug text-zinc-500">
            Describe what you want to see. The server maps your question to explorer
            filters (structured JSON). Same limits apply via UI and{" "}
            <code className="text-zinc-600">POST /api/v1/query/nl</code> for scripts.
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              page === "logs"
                ? 'e.g. "errors from checkout-api in the last hour mentioning timeout"'
                : page === "metrics"
                  ? 'e.g. "request latency for checkout-api over the last 6 hours"'
                  : 'e.g. "slow traces over 2s with errors for api-gateway"'
            }
            rows={2}
            className="w-full resize-y rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || input.trim().length < 3}
              onClick={() => void run()}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Thinking…" : "Translate & apply"}
            </button>
          </div>
          {error ? (
            <p className="text-xs text-red-300/95">{error}</p>
          ) : null}
          {lastReasoning ? (
            <p className="text-[11px] leading-snug text-zinc-500">{lastReasoning}</p>
          ) : null}
          {lastWarnings?.length ? (
            <ul className="list-inside list-disc text-[11px] text-amber-200/90">
              {lastWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
