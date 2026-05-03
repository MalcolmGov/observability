"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiOpsBriefCard } from "@/components/ai-ops-brief-card";

type OverviewPayload = {
  generatedAtMs: number;
  windowMs: number;
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

type RulesPayload = {
  rules: Array<{ enabled: boolean; name: string; service: string }>;
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function healthDot(h: "healthy" | "degraded" | "critical") {
  if (h === "critical") return "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.45)]";
  if (h === "degraded") return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]";
  return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]";
}

export function ExecutiveBriefingView() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const windowMs = 24 * 60 * 60 * 1000;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [ovRes, arRes] = await Promise.all([
        fetch(`/api/v1/overview?windowMs=${windowMs}`, { cache: "no-store" }),
        fetch("/api/v1/alerts/rules", { cache: "no-store" }),
      ]);
      if (!ovRes.ok) throw new Error("Overview unavailable");
      setOverview((await ovRes.json()) as OverviewPayload);
      if (arRes.ok) setRules((await arRes.json()) as RulesPayload);
      else setRules(null);
    } catch {
      setLoadError("Could not load briefing data.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const portfolio = useMemo(() => {
    if (!overview?.services.length) {
      return { healthy: 0, degraded: 0, critical: 0, receiving: 0 };
    }
    let healthy = 0;
    let degraded = 0;
    let critical = 0;
    let receiving = 0;
    for (const s of overview.services) {
      if (s.health === "critical") critical += 1;
      else if (s.health === "degraded") degraded += 1;
      else healthy += 1;
      if (s.receiving) receiving += 1;
    }
    return { healthy, degraded, critical, receiving };
  }, [overview]);

  const errorRatePct = useMemo(() => {
    if (!overview?.totals.logLines1h) return null;
    return (
      (overview.totals.errorLogs1h / Math.max(overview.totals.logLines1h, 1)) *
      100
    );
  }, [overview]);

  const alertCoverage = useMemo(() => {
    if (!rules?.rules.length) return { enabled: 0, total: 0 };
    const enabled = rules.rules.filter((r) => r.enabled).length;
    return { enabled, total: rules.rules.length };
  }, [rules]);

  const talkingPoints = useMemo(() => {
    const lines: string[] = [];
    if (!overview) return lines;
    const { totals, services } = overview;

    if (totals.services === 0) {
      lines.push(
        "No telemetry in this window yet — load the demo scenario to showcase metrics, logs, and traces in under a minute.",
      );
      return lines;
    }

    lines.push(
      `${totals.services} service${totals.services === 1 ? "" : "s"} visible across metrics, logs, and traces for the last 24 hours.`,
    );

    const vol =
      totals.metricPoints1h + totals.logLines1h;
    lines.push(
      `Roughly ${fmtCompact(vol)} telemetry events indexed in-window (${fmtCompact(totals.metricPoints1h)} metric samples · ${fmtCompact(totals.logLines1h)} log lines).`,
    );

    if (portfolio.critical > 0) {
      const names = services
        .filter((s) => s.health === "critical")
        .map((s) => s.service)
        .slice(0, 3)
        .join(", ");
      lines.push(
        `${portfolio.critical} service${portfolio.critical === 1 ? "" : "s"} marked critical from error signals${names ? ` (${names}${services.filter((s) => s.health === "critical").length > 3 ? "…" : ""})` : ""} — open Traces or Logs to tell the story.`,
      );
    } else if (portfolio.degraded > 0) {
      lines.push(
        `${portfolio.degraded} service${portfolio.degraded === 1 ? "" : "s"} show elevated warnings—good moment to walk through proactive detection.`,
      );
    } else {
      lines.push(
        "Portfolio posture is green on automated health signals—highlight how Pulse correlates signals when incidents do land.",
      );
    }

    if (alertCoverage.total > 0) {
      lines.push(
        `${alertCoverage.enabled} of ${alertCoverage.total} alert rule${alertCoverage.total === 1 ? "" : "s"} armed—tie this to your webhook or ticketing integration.`,
      );
    }

    return lines.slice(0, 5);
  }, [overview, portfolio, alertCoverage]);

  const postureLabel =
    portfolio.critical > 0
      ? "Attention needed"
      : portfolio.degraded > 0
        ? "Stable with watch items"
        : overview && overview.totals.services > 0
          ? "Operating within guardrails"
          : "Awaiting signal";

  const postureTone =
    portfolio.critical > 0
      ? "text-red-300"
      : portfolio.degraded > 0
        ? "text-amber-200"
        : overview && overview.totals.services > 0
          ? "text-emerald-300"
          : "text-zinc-400";

  const total = portfolio.healthy + portfolio.degraded + portfolio.critical;
  const pct = (n: number) =>
    total === 0 ? 0 : Math.round((n / total) * 1000) / 10;

  return (
    <div className="pulse-page gap-8 py-6 sm:py-8">
      <header className="pulse-page-head border-white/[0.06] pb-6">
        <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
              Stakeholder storyline
            </span>
            <h1 className="pulse-briefing-hero-title bg-gradient-to-r from-white via-violet-100 to-cyan-200/90 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-[1.85rem]">
              Operational clarity — without the vendor tax.
            </h1>
            <p className="pulse-lead max-w-2xl text-[15px]">
              One calm pane for portfolio posture, telemetry volume, and where
              to drill when execs ask “what broke?” Built from live data already
              in Pulse — ideal for board-ready demos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="pulse-btn-secondary text-sm"
            >
              Refresh storyline
            </button>
            <Link href="/#demo-showroom" className="pulse-btn-primary text-sm">
              Load demo data
            </Link>
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="pulse-alert-error">{loadError}</div>
      ) : null}

      <section className="pulse-briefing-hero-ring pulse-card-glow pulse-briefing-rise rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-950/25 via-slate-950/40 to-transparent p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">
              Portfolio posture · last 24h
            </div>
            <div className={`text-3xl font-semibold tracking-tight ${postureTone}`}>
              {postureLabel}
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
              Automated roll-up from error and warning logs per service — same
              engine your operators see on the command center.
            </p>
          </div>
          {total > 0 ? (
            <div className="flex w-full max-w-md flex-col gap-2">
              <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/[0.06]">
                <div
                  className="bg-emerald-500/85 transition-all duration-700"
                  style={{ width: `${pct(portfolio.healthy)}%` }}
                  title={`Healthy ${pct(portfolio.healthy)}%`}
                />
                <div
                  className="bg-amber-400/85 transition-all duration-700"
                  style={{ width: `${pct(portfolio.degraded)}%` }}
                />
                <div
                  className="bg-red-500/85 transition-all duration-700"
                  style={{ width: `${pct(portfolio.critical)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-zinc-500">
                <span>
                  <span className="text-emerald-400">●</span> Healthy{" "}
                  {portfolio.healthy}
                </span>
                <span>
                  <span className="text-amber-400">●</span> Watch{" "}
                  {portfolio.degraded}
                </span>
                <span>
                  <span className="text-red-400">●</span> Critical{" "}
                  {portfolio.critical}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Seed telemetry to light up this executive strip.
            </p>
          )}
        </div>
      </section>

      <AiOpsBriefCard />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="pulse-card pulse-briefing-rise pulse-briefing-rise-d1 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Services in view
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
            {overview ? overview.totals.services : "—"}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-zinc-500">
            Distinct workloads emitting metrics, logs, or traces in-window.
          </p>
        </div>
        <div className="pulse-card pulse-briefing-rise pulse-briefing-rise-d2 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Telemetry indexed
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
            {overview
              ? fmtCompact(
                  overview.totals.metricPoints1h + overview.totals.logLines1h,
                )
              : "—"}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-zinc-500">
            Metric samples plus log lines — volume narrative for scale questions.
          </p>
        </div>
        <div className="pulse-card pulse-briefing-rise pulse-briefing-rise-d3 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Error signal (logs)
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
            {errorRatePct != null ? `${errorRatePct.toFixed(2)}%` : "—"}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-zinc-500">
            Share of error-level lines vs. total logs — conversation starter on
            reliability.
          </p>
        </div>
        <div className="pulse-card pulse-briefing-rise pulse-briefing-rise-d4 p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Detection coverage
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
            {rules
              ? `${alertCoverage.enabled}/${alertCoverage.total}`
              : "—"}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-zinc-500">
            Enabled metric alert rules — bridge to runbooks and webhooks.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="pulse-card pulse-briefing-rise pulse-briefing-rise-d5 space-y-4 p-6">
          <h2 className="text-sm font-semibold text-white">
            Narrative prompts — read aloud or put on slide speaker notes
          </h2>
          <ul className="space-y-3">
            {talkingPoints.length ? (
              talkingPoints.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-[14px] leading-relaxed text-zinc-300"
                >
                  <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-violet-400/90 shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
                  <span>{line}</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-zinc-500">
                Loading storyline bullets…
              </li>
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="pulse-card-soft p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Drill-down choreography
            </h3>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/" className="pulse-btn-primary block text-center text-sm">
                Command center
              </Link>
              <Link
                href="/map"
                className="pulse-btn-secondary block text-center text-sm"
              >
                Service map
              </Link>
              <Link
                href="/traces"
                className="pulse-btn-secondary block text-center text-sm"
              >
                Trace explorer
              </Link>
              <Link href="/alerts" className="pulse-btn-ghost block text-center text-sm">
                Alert rules
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-slate-950/35 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
            Tip for live demos: refresh this page after{" "}
            <Link href="/#demo-showroom" className="pulse-link">
              loading the retail scenario
            </Link>{" "}
            so totals and posture update instantly.
          </div>
        </div>
      </section>

      <section className="pulse-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Service roster
            </h2>
            <p className="mt-1 text-[12px] text-zinc-500">
              Reception + health — executives see names, operators open traces.
            </p>
          </div>
          <Link href="/services" className="pulse-link text-xs">
            Full inventory →
          </Link>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {!overview?.services.length ? (
            <li className="col-span-full pulse-chart-empty py-10 text-sm">
              No services in the last 24h. Seed demo data from the button above.
            </li>
          ) : (
            overview.services.map((s) => (
              <li
                key={s.service}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5"
              >
                <span
                  className={`inline-flex size-2.5 shrink-0 rounded-full ${healthDot(s.health)}`}
                  title={s.health}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-100">
                    {s.service}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {s.receiving ? (
                      <span className="text-emerald-400/90">Receiving</span>
                    ) : (
                      <span className="text-zinc-600">Quiet</span>
                    )}
                    {" · "}
                    {s.errors1h} err · {s.warns1h} warn
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {overview ? (
        <p className="text-center text-[11px] text-zinc-600">
          Data window ends{" "}
          {new Date(overview.generatedAtMs).toLocaleString()} ·{" "}
          {overview.windowMs >= 86_400_000
            ? `${overview.windowMs / 86_400_000}d`
            : `${Math.round(overview.windowMs / 60_000)}m`}{" "}
          rollup
        </p>
      ) : null}
    </div>
  );
}
