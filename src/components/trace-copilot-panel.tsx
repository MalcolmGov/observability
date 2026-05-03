"use client";

import { explainTraceAction } from "@/app/actions/trace-copilot";
import type { TraceCopilotBrief } from "@/lib/trace-copilot-schema";
import { useCallback, useEffect, useState } from "react";

export function TraceCopilotPanel({ traceId }: { traceId: string }) {
  const [openAi, setOpenAi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<TraceCopilotBrief | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/health", { cache: "no-store" });
        const j = (await res.json()) as {
          naturalLanguageQuery?: { openaiConfigured?: boolean };
        };
        if (!cancelled) {
          setOpenAi(Boolean(j?.naturalLanguageQuery?.openaiConfigured));
        }
      } catch {
        if (!cancelled) setOpenAi(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBrief(null);
    setError(null);
  }, [traceId]);

  const run = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await explainTraceAction(traceId);
      if (!res.ok) {
        setError(res.error);
        setBrief(null);
        return;
      }
      setBrief(res.brief);
    } finally {
      setBusy(false);
    }
  }, [traceId]);

  const disabled =
    busy || openAi === false || openAi === null || !traceId.trim();

  return (
    <section className="pulse-card-soft pulse-briefing-rise rounded-2xl border border-violet-500/20 p-6 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
            Trace copilot
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            RCA-style readout from this trace&apos;s spans
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-500">
            Explains the waterfall using span names, timing, status, and
            attributes already stored in Pulse — not live logs unless you open
            them. Useful for demos or narrowing down where latency or errors
            concentrated.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void run()}
            className="pulse-btn-primary whitespace-nowrap px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Analyzing…" : "Explain this trace"}
          </button>
          {openAi === false ? (
            <p className="max-w-xs text-right text-[11px] leading-snug text-amber-200/90">
              Set{" "}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-zinc-300">
                OPENAI_API_KEY
              </code>{" "}
              on the server to enable this feature.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/25 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {brief ? (
        <div className="mt-6 space-y-5 border-t border-white/[0.06] pt-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Summary
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
              {brief.summary}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Likely story
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {brief.likelyStory}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Timeline
              </p>
              <ul className="mt-2 space-y-2 text-[13px] leading-snug text-zinc-400">
                {brief.timelineBullets.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 font-mono text-[10px] tabular-nums text-zinc-600">
                      {i + 1}.
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Hotspots
              </p>
              <ul className="mt-2 space-y-2 text-[13px] leading-snug text-zinc-400">
                {brief.hotspots.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-400/80" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Suggested checks
            </p>
            <ul className="mt-2 space-y-2 text-[13px] leading-snug text-zinc-400">
              {brief.suggestedChecks.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400/80" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300/90">
              Caveats
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-200">
              {brief.caveat}
            </p>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Generated from this trace&apos;s spans only. Large traces may be
            sampled for the model — verify against the waterfall and raw spans
            below before acting.
          </p>
        </div>
      ) : null}
    </section>
  );
}
