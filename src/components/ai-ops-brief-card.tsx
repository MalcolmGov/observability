"use client";

import { generateOpsBriefAction } from "@/app/actions/ops-brief";
import type { OpsBrief } from "@/lib/ops-brief-schema";
import { useCallback, useEffect, useState } from "react";

export function AiOpsBriefCard() {
  const [openAi, setOpenAi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<OpsBrief | null>(null);

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

  const run = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await generateOpsBriefAction();
      if (!res.ok) {
        setError(res.error);
        setBrief(null);
        return;
      }
      setBrief(res.brief);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="pulse-card-soft pulse-briefing-rise rounded-2xl border border-violet-500/20 p-6 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
            AI Ops brief
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            Stakeholder-ready narrative from live telemetry
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-500">
            Summarizes the last 24 hours of metrics, logs, traces, and alerts
            already in Pulse — grounded in data, not guesses. Ideal for demos,
            weekly reviews, or &ldquo;what should we watch?&rdquo; conversations.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            disabled={
              busy || openAi === false || openAi === null
            }
            onClick={() => void run()}
            className="pulse-btn-primary whitespace-nowrap px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Generating…" : "Generate AI Ops brief"}
          </button>
          {openAi === false ? (
            <p
              className="max-w-xs text-right text-[11px] leading-snug"
              style={{ color: "var(--pulse-status-warning-fg)" }}
            >
              Set{" "}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-zinc-300">
                OPENAI_API_KEY
              </code>{" "}
              on the server to enable this feature.
            </p>
          ) : null}
        </div>
      </div>

      {error ? <p className="pulse-alert-error mt-4">{error}</p> : null}

      {brief ? (
        <div className="pulse-fade-in mt-6 space-y-5 border-t border-[var(--pulse-border-default)] pt-6">
          <div>
            <p className="pulse-eyebrow">Headline</p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">
              {brief.headline}
            </p>
          </div>
          <div>
            <p className="pulse-eyebrow">Narrative</p>
            <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
              {brief.narrative}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="pulse-eyebrow">Risks &amp; focus</p>
              <ul className="mt-2 space-y-2 text-[13px] leading-snug text-zinc-400">
                {brief.risks.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="pulse-status-dot pulse-status-dot-warning mt-1.5 shrink-0"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="pulse-eyebrow">Recommended actions</p>
              <ul className="mt-2 space-y-2 text-[13px] leading-snug text-zinc-400">
                {brief.actions.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="pulse-status-dot pulse-status-dot-success mt-1.5 shrink-0"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300/90">
              Board / investor line
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-200">
              {brief.boardTalkingPoint}
            </p>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Generated from current Pulse data only. Review before external
            sharing — AI summaries can misread sparse or skewed telemetry.
          </p>
        </div>
      ) : null}
    </section>
  );
}
