"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  DEMO_METRICS,
  DEMO_NL_PROMPTS,
  DEMO_SERVICES,
  DEMO_STORAGE_KEY,
  demoLogsUrl,
  demoMetricsUrl,
  demoTraceDetailUrl,
  demoTracesUrl,
  type DemoSeedApiResponse,
  type DemoSeedClientPayload,
} from "@/lib/demo-scenario";

type Props = {
  loading: boolean;
  demoMeta: DemoSeedApiResponse | null;
  seedError: string | null;
  onSeed: () => Promise<void>;
};

export function DemoLaunchpad({
  loading,
  demoMeta,
  seedError,
  onSeed,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const traceHappy = demoMeta?.traceIds?.happyPath;
  const traceFailed = demoMeta?.traceIds?.failedCheckout;

  const copyNl = useCallback(async (prompt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  return (
    <section className="pulse-card-soft pulse-fade-in overflow-hidden p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl space-y-2">
          <div className="pulse-eyebrow text-indigo-300/80">Demo showroom</div>
          <h2 className="pulse-h3">
            Load a realistic retail checkout scenario
          </h2>
          <p className="pulse-body text-zinc-400">
            Three services ({DEMO_SERVICES.checkout},{" "}
            {DEMO_SERVICES.inventory}, {DEMO_SERVICES.payment}), golden-signal
            metrics, correlated logs, happy-path and failing PSP traces, SLO
            target, and starter alert rules — tuned for walkthroughs and NL
            experiments.
          </p>
          <ol className="list-inside list-decimal space-y-1 text-[13px] text-zinc-500">
            <li>Seed data (idempotent rules — safe to click again).</li>
            <li>Open a trace waterfall or error logs — links below update after seed.</li>
            <li>Paste a suggestion into Natural language query on any explorer.</li>
          </ol>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onSeed()}
            className="pulse-btn-primary px-5 py-3"
          >
            {loading ? "Seeding…" : "Load demo scenario"}
          </button>
          <p className="pulse-caption sm:max-w-[200px] lg:max-w-none">
            Production: set{" "}
            <code className="text-zinc-500">ALLOW_DEMO_SEED=1</code> to enable.
          </p>
        </div>
      </div>

      {seedError ? (
        <p className="pulse-alert-error mt-4">{seedError}</p>
      ) : null}

      {demoMeta?.ok && demoMeta.inserted ? (
        <p
          className="mt-4 text-[12px]"
          style={{ color: "var(--pulse-status-success-fg)" }}
        >
          Last seed: v{demoMeta.scenarioVersion ?? "?"} —{" "}
          {demoMeta.inserted.metricPoints.toLocaleString()} metric points,{" "}
          {demoMeta.inserted.logEntries} logs, {demoMeta.inserted.traceSpans}{" "}
          spans
          {demoMeta.alertsEnsured != null
            ? ` · ${demoMeta.alertsEnsured} alert rules ensured`
            : ""}
          .
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LinkCard
          title="Error logs"
          desc="Checkout + “payment” keyword, last 24h window"
          href={demoLogsUrl({
            service: DEMO_SERVICES.checkout,
            q: "payment",
            level: "error",
            windowMs: 24 * 60 * 60 * 1000,
          })}
        />
        <LinkCard
          title="Latency chart"
          desc={`${DEMO_SERVICES.checkout} · ${DEMO_METRICS.requestDuration}`}
          href={demoMetricsUrl(
            DEMO_SERVICES.checkout,
            DEMO_METRICS.requestDuration,
            "6h",
          )}
        />
        <LinkCard
          title="Failing traces"
          desc="Errors only · checkout · last 24h"
          href={demoTracesUrl({
            service: DEMO_SERVICES.checkout,
            errorsOnly: true,
            lookbackMs: 86_400_000,
          })}
        />
        <LinkCard title="Service map" desc="Dependency graph" href="/map" />
      </div>

      {(traceHappy || traceFailed) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {traceHappy ? (
            <Link
              href={demoTraceDetailUrl(traceHappy)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-indigo-100 hover:bg-white/10"
            >
              Happy-path trace
            </Link>
          ) : null}
          {traceFailed ? (
            <Link
              href={demoTraceDetailUrl(traceFailed)}
              className="pulse-chip pulse-chip-danger pulse-transition"
              style={{ padding: "0.375rem 0.75rem" }}
            >
              Failed PSP trace
            </Link>
          ) : null}
        </div>
      )}

      <div className="mt-6 border-t border-[var(--pulse-border-default)] pt-4">
        <div className="pulse-eyebrow">NL query starters</div>
        <p className="mt-1 text-[11px] text-zinc-600">
          Paste into “Natural language query” on Logs, Metrics, or Traces — copies to clipboard.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_NL_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void copyNl(item.prompt, item.label)}
              className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-[11px] text-zinc-300 hover:border-indigo-500/35 hover:text-indigo-100"
            >
              {copied === item.label ? "Copied — paste in explorer" : item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function LinkCard(props: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="pulse-transition group rounded-xl border border-[var(--pulse-border-default)] bg-slate-950/25 px-4 py-3 hover:-translate-y-px hover:border-indigo-500/40 hover:bg-indigo-950/20"
    >
      <div className="pulse-title text-zinc-100 group-hover:text-indigo-100">
        {props.title}
      </div>
      <div className="pulse-caption mt-1">{props.desc}</div>
    </Link>
  );
}

/** Hydrate demo trace links after refresh from sessionStorage */
export function readStoredDemoSeed(): DemoSeedApiResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DemoSeedClientPayload;
    if (!p.traceIds?.happyPath || !p.traceIds?.failedCheckout) return null;
    return {
      ok: true,
      scenarioVersion: p.scenarioVersion,
      traceIds: p.traceIds,
      inserted: p.inserted,
      alertsEnsured: p.alertsEnsured,
    };
  } catch {
    return null;
  }
}

export function persistDemoSeed(payload: DemoSeedApiResponse) {
  if (typeof window === "undefined" || !payload.ok || !payload.traceIds) return;
  const client: DemoSeedClientPayload = {
    scenarioVersion: payload.scenarioVersion ?? 2,
    traceIds: payload.traceIds,
    seededAtMs: Date.now(),
    inserted: payload.inserted,
    alertsEnsured: payload.alertsEnsured,
  };
  sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(client));
}
