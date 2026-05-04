"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";

type Rule = {
  id: number;
  name: string;
  enabled: boolean;
  metricName: string;
  service: string;
  comparator: string;
  threshold: number;
  windowMinutes: number;
  webhookUrl: string | null;
  runbookUrl: string | null;
  slackWebhookUrl: string | null;
  pagerdutyRoutingKey: string | null;
};

type EvalRow = {
  id: number;
  name: string;
  metricName: string;
  service: string;
  comparator: string;
  threshold: number;
  windowMinutes: number;
  observedAvg: number | null;
  firing: boolean;
  silenced: boolean;
  runbookUrl: string | null;
};

type SilenceRow = {
  id: number;
  ruleId: number | null;
  endsAtMs: number;
  reason: string | null;
  createdAtMs: number;
};

type HistoryEntry = {
  id: number;
  ruleId: number;
  ruleName: string | null;
  evaluatedAtMs: number;
  firing: boolean;
  observedAvg: number | null;
  silenced: boolean;
};

type Incident = {
  ruleId: number;
  ruleName: string;
  service: string;
  severity: "info" | "warning" | "critical";
  metricName: string | null;
  comparator: string | null;
  threshold: number | null;
  observedAvg: number | null;
  marketScope: string | null;
  environment: string;
  runbookUrl: string | null;
  evaluatedAtMs: number;
};

import { useAuth } from "@/components/auth-provider";

export function AlertsView() {
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";
  const [rules, setRules] = useState<Rule[]>([]);
  const [evalRows, setEvalRows] = useState<EvalRow[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [firingCount, setFiringCount] = useState(0);
  const [notificationsSent, setNotificationsSent] = useState(0);
  const [skippedDedupe, setSkippedDedupe] = useState(0);
  const [skippedSilence, setSkippedSilence] = useState(0);
  const [groupWindowMs, setGroupWindowMs] = useState(30 * 60 * 1000);
  const [silences, setSilences] = useState<SilenceRow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const incidentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [silenceRuleId, setSilenceRuleId] = useState<string>("");
  const [silenceDurationMins, setSilenceDurationMins] = useState("60");
  const [silenceReason, setSilenceReason] = useState("");

  const [form, setForm] = useState({
    name: "",
    rule_type: "metric" as "metric" | "log_count" | "slo_burn",
    metric_name: "http.server.request_duration_ms",
    service: "checkout-api",
    comparator: "gt" as "gt" | "lt",
    threshold: "200",
    window_minutes: "5",
    webhook_url: "",
    slack_webhook_url: "",
    pagerduty_routing_key: "",
    runbook_url: "",
    log_level: "error" as "error" | "warn" | "info" | "any",
    log_pattern: "",
    slo_burn_window: "1h" as "1h" | "6h" | "24h",
    slo_burn_threshold: "2.0",
  });

  const loadSilences = useCallback(async () => {
    const res = await fetch("/api/v1/alerts/silences");
    if (!res.ok) throw new Error("Failed to load silences");
    const data = (await res.json()) as { silences: SilenceRow[] };
    setSilences(data.silences);
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/v1/alerts/history?limit=120");
    if (!res.ok) throw new Error("Failed to load history");
    const data = (await res.json()) as { entries: HistoryEntry[] };
    setHistory(data.entries);
  }, []);

  const loadRules = useCallback(async () => {
    const res = await fetch("/api/v1/alerts/rules");
    if (!res.ok) throw new Error("Failed to load rules");
    const data = (await res.json()) as { rules: Rule[] };
    setRules(data.rules);
  }, []);

  const evaluate = useCallback(async () => {
    const res = await fetch("/api/v1/alerts/evaluate");
    if (!res.ok) throw new Error("Evaluate failed");
    const data = (await res.json()) as {
      results: EvalRow[];
      firingCount: number;
      notificationsSent?: number;
      webhooksSent?: number;
      skippedDedupe?: number;
      skippedSilence?: number;
      groupWindowMs?: number;
    };
    setEvalRows(data.results);
    setFiringCount(data.firingCount);
    setNotificationsSent(data.notificationsSent ?? data.webhooksSent ?? 0);
    setSkippedDedupe(data.skippedDedupe ?? 0);
    setSkippedSilence(data.skippedSilence ?? 0);
    if (
      typeof data.groupWindowMs === "number" &&
      Number.isFinite(data.groupWindowMs)
    ) {
      setGroupWindowMs(data.groupWindowMs);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    const res = await fetch("/api/v1/alerts/notifications?windowMs=86400000&limit=50");
    if (!res.ok) return;
    const data = (await res.json()) as { notifications: Incident[] };
    setIncidents(data.notifications);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadRules();
        await loadSilences();
        await loadHistory();
        await evaluate();
        await loadIncidents();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
    // Poll active incidents every 30s
    incidentTimerRef.current = setInterval(() => { void loadIncidents(); }, 30_000);
    return () => { if (incidentTimerRef.current) clearInterval(incidentTimerRef.current); };
  }, [evaluate, loadHistory, loadIncidents, loadRules, loadSilences]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name || `Rule ${new Date().toLocaleTimeString()}`,
        rule_type: form.rule_type,
        service: form.service,
        comparator: form.comparator,
        threshold: Number(form.threshold),
        window_minutes: Number(form.window_minutes),
        webhook_url: form.webhook_url.trim() || "",
        slack_webhook_url: form.slack_webhook_url.trim() || "",
        pagerduty_routing_key: form.pagerduty_routing_key.trim() || "",
        runbook_url: form.runbook_url.trim() || "",
      };
      if (form.rule_type === "log_count") {
        body.log_level = form.log_level;
        body.log_pattern = form.log_pattern.trim() || null;
      } else if (form.rule_type === "slo_burn") {
        body.slo_burn_window = form.slo_burn_window;
        body.slo_burn_threshold = Number(form.slo_burn_threshold);
      } else {
        body.metric_name = form.metric_name;
      }
      const res = await fetch("/api/v1/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const bd = await res.json().catch(() => ({}));
        throw new Error((bd as { error?: string }).error ?? "Create failed");
      }
      setForm((f) => ({ ...f, name: "", webhook_url: "", slack_webhook_url: "", pagerduty_routing_key: "", runbook_url: "", log_pattern: "" }));
      await loadRules();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/alerts/rules?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await loadRules();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function seedDemo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/demo/seed", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Seed failed");
      }
      await loadRules();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchRule(
    id: number,
    patch: Partial<{
      runbook_url: string;
      webhook_url: string;
      slack_webhook_url: string;
      pagerduty_routing_key: string;
    }>,
    errLabel: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? errLabel,
        );
      }
      await loadRules();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : errLabel);
    } finally {
      setBusy(false);
    }
  }

  async function createSilence(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dm = Number(silenceDurationMins);
      if (!Number.isFinite(dm) || dm < 5) {
        throw new Error("Duration must be at least 5 minutes");
      }
      let ruleId: number | null = null;
      if (silenceRuleId !== "") {
        const n = Number(silenceRuleId);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error("Pick a rule or “All rules”");
        }
        ruleId = n;
      }
      const res = await fetch("/api/v1/alerts/silences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId,
          durationMinutes: dm,
          reason: silenceReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Silence failed",
        );
      }
      setSilenceReason("");
      await loadSilences();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silence failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSilence(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/alerts/silences?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove silence");
      await loadSilences();
      await evaluate();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove silence");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pulse-page pulse-page-transition gap-6 py-6 sm:py-8">
      <header className="pulse-page-head border-white/[0.06] pb-5">
        <div>
          <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-[1.65rem] font-bold tracking-tight text-transparent" style={{ letterSpacing: '-0.03em' }}>
            Alerts
          </h1>
          <p className="pulse-lead">
            Threshold rules on rolling metric averages — route firing alerts to
            Slack, PagerDuty, or any webhook endpoint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                try {
                  await evaluate();
                  await loadHistory();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              })()
            }
            className="pulse-btn-secondary disabled:opacity-50"
          >
            Re-evaluate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedDemo()}
            className="pulse-btn-primary disabled:opacity-50"
          >
            Load demo
          </button>
        </div>
      </header>

      {error ? (
        <div className="pulse-alert-error">{error}</div>
      ) : null}

      {/* Stats banner */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`pulse-stat-card pulse-stat-stripe-${firingCount > 0 ? 'rose' : 'emerald'} p-4 pt-5`}>
          <div className="pulse-eyebrow">Firing</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{firingCount}</div>
          <div className="pulse-caption mt-1">{firingCount > 0 ? 'Rules breaching threshold' : 'All clear'}</div>
        </div>
        <div className="pulse-stat-card pulse-stat-stripe-sky p-4 pt-5">
          <div className="pulse-eyebrow">Notifications</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{notificationsSent}</div>
          <div className="pulse-caption mt-1">Sent last evaluation</div>
        </div>
        <div className="pulse-stat-card pulse-stat-stripe-cyan p-4 pt-5">
          <div className="pulse-eyebrow">Group window</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{Math.round(groupWindowMs / 60000)}m</div>
          <div className="pulse-caption mt-1">
            {skippedDedupe > 0 ? `${skippedDedupe} deduped` : 'Dedupe active'}
            {skippedSilence > 0 ? ` · ${skippedSilence} silenced` : ''}
          </div>
        </div>
      </div>

      {/* ── WAR ROOM ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-zinc-100">Active Incidents</h2>
            {incidents.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                </span>
                {incidents.length} firing
              </span>
            )}
          </div>
          <button type="button" onClick={() => void loadIncidents()}
            className="text-[11px] text-zinc-600 transition hover:text-zinc-300">
            ↻ Refresh
          </button>
        </div>

        {incidents.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <span className="text-xl">✅</span>
            <div>
              <div className="text-sm font-semibold text-emerald-300">All clear — no active incidents</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">No alert rules have been breaching thresholds in the last 24 hours.</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {incidents.map((inc) => {
              const ageMs = Date.now() - inc.evaluatedAtMs;
              const ageMins = Math.floor(ageMs / 60000);
              const ageStr = ageMins < 60 ? `${ageMins}m ago` : `${Math.floor(ageMins / 60)}h ${ageMins % 60}m ago`;
              const sevColor = inc.severity === "critical"
                ? { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.25)", badge: "#f87171", badgeBg: "rgba(248,113,113,0.15)" }
                : inc.severity === "warning"
                  ? { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)", badge: "#fbbf24", badgeBg: "rgba(251,191,36,0.12)" }
                  : { bg: "rgba(56,189,248,0.06)", border: "rgba(56,189,248,0.18)", badge: "#38bdf8", badgeBg: "rgba(56,189,248,0.1)" };
              const metricStr = inc.metricName
                ? `${inc.metricName} ${inc.comparator === "gt" ? ">" : "<"} ${inc.threshold}`
                : null;
              return (
                <div key={inc.ruleId} className="rounded-2xl p-4"
                  style={{ background: sevColor.bg, border: `1px solid ${sevColor.border}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Left: info */}
                    <div className="flex items-start gap-3">
                      {/* Severity icon */}
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl text-base"
                        style={{ background: sevColor.badgeBg, border: `1px solid ${sevColor.border}` }}>
                        {inc.severity === "critical" ? "🔴" : inc.severity === "warning" ? "🟡" : "🔵"}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-white">{inc.ruleName}</span>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: sevColor.badgeBg, color: sevColor.badge }}>
                            {inc.severity}
                          </span>
                          <span className="text-[11px] text-zinc-500">{ageStr}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-zinc-400">
                          <span>🔧 <span className="text-zinc-300">{inc.service}</span></span>
                          {metricStr && <span>📊 <span className="font-mono text-zinc-300">{metricStr}</span></span>}
                          {inc.observedAvg != null && (
                            <span>Observed: <span className="font-semibold" style={{ color: sevColor.badge }}>{inc.observedAvg.toFixed(2)}</span></span>
                          )}
                          {inc.environment && <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">{inc.environment}</span>}
                          {inc.marketScope && <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-500">{inc.marketScope}</span>}
                        </div>
                        <div className="mt-2 text-[11px] text-zinc-600">
                          Detected: {format(new Date(inc.evaluatedAtMs), "dd MMM HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                    {/* Right: actions */}
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <a href={`/metrics?service=${encodeURIComponent(inc.service)}${inc.metricName ? `&metric=${encodeURIComponent(inc.metricName)}` : ""}&range=1h`}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                        style={{ background: "rgba(6,214,199,0.1)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.25)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.18)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.1)"; }}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5.5 1v4l2.5 1.5" /></svg>
                        Investigate
                      </a>
                      <a href={`/logs?service=${encodeURIComponent(inc.service)}&level=error`}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                        style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
                        Logs
                      </a>
                      <a href={`/traces?service=${encodeURIComponent(inc.service)}&errorsOnly=1`}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                        style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
                        Traces
                      </a>
                      {inc.runbookUrl && (
                        <a href={inc.runbookUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                          style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.15)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.08)"; }}>
                          📓 Runbook
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── NOTIFICATION CHANNELS ─────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">Notification Channels</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Slack */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-xl">💬</span>
              <div>
                <div className="text-sm font-semibold text-zinc-100">Slack</div>
                <div className="text-[10px] text-zinc-500">Incoming webhook</div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
              Alerts fire directly into any Slack channel. Set the webhook per-rule in the rule editor below.
            </p>
            <div className="rounded-lg px-3 py-2 font-mono text-[10px] text-zinc-400" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {`Routing: rule → slack_webhook_url`}
            </div>
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1 text-[11px] transition" style={{ color: "#06d6c7" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#5eead4"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#06d6c7"; }}>
              Get a Slack webhook URL →
            </a>
          </div>

          {/* PagerDuty */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-xl">📟</span>
              <div>
                <div className="text-sm font-semibold text-zinc-100">PagerDuty</div>
                <div className="text-[10px] text-zinc-500">Events API v2</div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
              Triggers a PagerDuty incident with dedup key per rule. Set the routing key per-rule below.
            </p>
            <div className="rounded-lg px-3 py-2 font-mono text-[10px] text-zinc-400" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {`Routing: rule → pagerduty_routing_key`}
            </div>
            <a href="https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTgw-events-api-v2-overview" target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1 text-[11px] transition" style={{ color: "#06d6c7" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#5eead4"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#06d6c7"; }}>
              Get a PagerDuty routing key →
            </a>
          </div>

          {/* Generic webhook */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-xl">🔗</span>
              <div>
                <div className="text-sm font-semibold text-zinc-100">Webhook</div>
                <div className="text-[10px] text-zinc-500">HTTP POST · JSON payload</div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
              POST a structured JSON payload to any URL — works with Teams, Opsgenie, custom systems.
            </p>
            <div className="rounded-lg px-3 py-2 font-mono text-[10px] text-zinc-400" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {`event: "pulse.alert.firing"`}
            </div>
            <a href="/integrations"
              className="mt-3 flex items-center gap-1 text-[11px] transition" style={{ color: "#06d6c7" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#5eead4"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#06d6c7"; }}>
              Browse integrations →
            </a>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          ℹ️ Notifications are dispatched automatically on each evaluation. Group window deduplication prevents repeat pages within {Math.round(groupWindowMs / 60000)} minutes.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(e) => void createRule(e)}
          className="pulse-card flex flex-col gap-3 p-5"
        >
          <h2 className="pulse-h3">New rule</h2>

          {/* Rule type tabs */}
          <div className="flex rounded-xl overflow-hidden border border-white/[0.08] text-xs font-semibold">
            {([
              { id: "metric",    label: "⚡ Metric",      color: "rgba(6,214,199,0.12)",   text: "#06d6c7" },
              { id: "log_count", label: "📝 Log Pattern", color: "rgba(248,113,113,0.15)", text: "#f87171" },
              { id: "slo_burn",  label: "🔥 SLO Burn",   color: "rgba(251,146,60,0.15)",  text: "#fb923c" },
            ] as const).map((t) => (
              <button key={t.id} type="button"
                onClick={() => setForm(f => ({ ...f, rule_type: t.id }))}
                className={`flex-1 py-2 transition ${
                  form.rule_type === t.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
                style={form.rule_type === t.id ? { background: t.color, color: t.text } : {}}>
                {t.label}
              </button>
            ))}
          </div>

          <label className="pulse-caption block">
            Name
            <input className="pulse-input mt-1 w-full" value={form.name}
              placeholder={
                form.rule_type === "log_count" ? "High error log rate"
                : form.rule_type === "slo_burn"  ? "Checkout SLO burn alert"
                : "Checkout p95 budget"
              }
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>

          {form.rule_type === "metric" ? (
            <>
              <label className="pulse-caption block">
                Metric
                <input className="pulse-input mt-1 w-full" value={form.metric_name}
                  onChange={(e) => setForm((f) => ({ ...f, metric_name: e.target.value }))} />
              </label>
            </>
          ) : form.rule_type === "log_count" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="pulse-caption block">
                Log level
                <select className="pulse-select mt-1 w-full" value={form.log_level}
                  onChange={(e) => setForm((f) => ({ ...f, log_level: e.target.value as typeof form.log_level }))}>
                  <option value="error">error</option>
                  <option value="warn">warn</option>
                  <option value="info">info</option>
                  <option value="any">any level</option>
                </select>
              </label>
              <label className="pulse-caption block">
                Pattern <span className="text-zinc-600">(optional)</span>
                <input className="pulse-input mt-1 w-full" value={form.log_pattern}
                  placeholder="TIMEOUT, OOM, …"
                  onChange={(e) => setForm((f) => ({ ...f, log_pattern: e.target.value }))} />
              </label>
            </div>
          ) : (
            /* SLO Burn fields */
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
              <p className="mb-3 text-[11px] font-semibold" style={{ color: "#fb923c" }}>
                Fires when the error rate consumes SLO budget faster than the multiplier within the chosen window.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="pulse-caption block">
                  Burn window
                  <select className="pulse-select mt-1 w-full" value={form.slo_burn_window}
                    onChange={(e) => setForm((f) => ({ ...f, slo_burn_window: e.target.value as typeof form.slo_burn_window }))}>
                    <option value="1h">1h (fast burn)</option>
                    <option value="6h">6h (medium burn)</option>
                    <option value="24h">24h (slow burn)</option>
                  </select>
                </label>
                <label className="pulse-caption block">
                  Burn rate multiplier
                  <input type="number" step="0.5" min="1" className="pulse-input mt-1 w-full"
                    value={form.slo_burn_threshold}
                    placeholder="2.0"
                    onChange={(e) => setForm((f) => ({ ...f, slo_burn_threshold: e.target.value }))} />
                  <span className="text-[10px] text-zinc-600">e.g. 2.0 = 2× budget rate</span>
                </label>
              </div>
            </div>
          )}

          <label className="pulse-caption block">
            Service
            <input className="pulse-input mt-1 w-full" value={form.service}
              onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))} />
          </label>

          {/* Comparator + threshold — hidden for slo_burn (uses its own threshold) */}
          {form.rule_type !== "slo_burn" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="pulse-caption block">
                {form.rule_type === "log_count" ? "Count comparator" : "Comparator"}
                <select className="pulse-select mt-1 w-full" value={form.comparator}
                  onChange={(e) => setForm((f) => ({ ...f, comparator: e.target.value as "gt" | "lt" }))}>
                  <option value="gt">greater than (&gt;)</option>
                  <option value="lt">less than (&lt;)</option>
                </select>
              </label>
              <label className="pulse-caption block">
                {form.rule_type === "log_count" ? "Count threshold" : "Threshold"}
                <input type="number" step="any" className="pulse-input mt-1 w-full" value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              </label>
            </div>
          )}

          {/* Window — hidden for slo_burn (uses its own burn window) */}
          {form.rule_type !== "slo_burn" && (
            <label className="pulse-caption block">
              Window (minutes)
              <input type="number" min={1} className="pulse-input mt-1 w-full" value={form.window_minutes}
                onChange={(e) => setForm((f) => ({ ...f, window_minutes: e.target.value }))} />
            </label>
          )}
          <label className="pulse-caption block">
            Webhook URL <span className="text-zinc-600">(optional)</span>
            <input className="pulse-input mt-1 w-full" value={form.webhook_url}
              placeholder="https://example.com/hooks/pulse"
              onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))} />
          </label>
          <label className="pulse-caption block">
            Slack webhook <span className="text-zinc-600">(optional)</span>
            <input className="pulse-input mt-1 w-full" value={form.slack_webhook_url}
              placeholder="https://hooks.slack.com/services/…"
              onChange={(e) => setForm((f) => ({ ...f, slack_webhook_url: e.target.value }))} />
          </label>
          <label className="pulse-caption block">
            PagerDuty routing key <span className="text-zinc-600">(optional)</span>
            <input className="pulse-input mt-1 w-full" value={form.pagerduty_routing_key}
              placeholder="Events API v2 integration key"
              onChange={(e) => setForm((f) => ({ ...f, pagerduty_routing_key: e.target.value }))} />
          </label>
          <label className="pulse-caption block">
            Runbook URL <span className="text-zinc-600">(optional)</span>
            <input className="pulse-input mt-1 w-full" value={form.runbook_url}
              placeholder="https://wiki.example.com/runbooks/…"
              onChange={(e) => setForm((f) => ({ ...f, runbook_url: e.target.value }))} />
          </label>
          <p className="pulse-caption">
            {form.rule_type === "log_count"
              ? "Fires when the matching log count exceeds the threshold within the window. Notifies via Slack, PagerDuty, or Webhook."
              : form.rule_type === "slo_burn"
              ? "Fires when the error burn rate exceeds the multiplier threshold. An SLO target must exist for the service (via PUT /api/v1/slo/targets)."
              : "Firing rules notify via webhook (pulse.alert.firing), Slack, or PagerDuty Events v2."}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || isViewer}
              className="pulse-btn-primary disabled:opacity-50"
              title={isViewer ? "Viewers cannot create alert rules." : ""}
            >
              Save rule
            </button>
            {isViewer && <span className="text-[11px] text-amber-500">Viewers cannot create rules</span>}
          </div>
        </form>

        <div className="pulse-card-soft p-5">
          <h2 className="pulse-h3">Saved rules <span className="ml-1 text-zinc-500">({rules.length})</span></h2>
          <ul className="mt-4 flex max-h-[min(50vh,400px)] flex-col gap-2 overflow-y-auto">
            {rules.length === 0 ? (
              <li>
                <div className="pulse-empty py-8">
                  <div className="pulse-empty-icon">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.082A2.25 2.25 0 0021.75 14v-1.44a2.25 2.25 0 00-1.263-2.026l-1.875-.937A2.25 2.25 0 0015.75 8.25V6a3.375 3.375 0 00-3.375-3.375h-1.5A3.375 3.375 0 007.5 6v2.25a2.25 2.25 0 01-1.662 2.163l-1.875.937A2.25 2.25 0 002.25 12.56v1.44c0 .754.385 1.458 1.021 1.86 1.68.98 3.49 1.719 5.382 2.184" /></svg>
                  </div>
                  <p className="pulse-empty-title">No rules yet</p>
                  <p className="pulse-empty-hint">Create a rule to start monitoring metric thresholds and routing alerts.</p>
                </div>
              </li>
            ) : (
              rules.map((r) => (
                <li
                  key={r.id}
                  className="group flex flex-col gap-2 rounded-xl border border-white/[0.05] bg-slate-950/40 px-3 py-3 text-xs transition hover:border-white/[0.09] hover:bg-slate-950/60"
                  style={{ borderLeft: '3px solid rgba(56,189,248,0.25)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-zinc-100">{r.name}</div>
                      <div className="mt-1 text-zinc-500">
                        {r.metricName} @ {r.service} — avg {r.comparator}{" "}
                        {r.threshold} over {r.windowMinutes}m
                      </div>
                      <div className="mt-1 text-[10px] uppercase text-zinc-600">
                        {r.enabled ? "enabled" : "disabled"}
                        {r.webhookUrl ? " · webhook" : ""}
                        {r.slackWebhookUrl ? " · slack" : ""}
                        {r.pagerdutyRoutingKey ? " · pagerduty" : ""}
                        {r.runbookUrl ? " · runbook" : ""}
                      </div>
                      
                      {!isViewer && (
                        <>
                          <label className="mt-2 block text-[10px] text-zinc-600">
                            Webhook
                            <input
                              key={`${r.id}-wh-${r.webhookUrl ?? ""}`}
                              disabled={busy}
                              defaultValue={r.webhookUrl ?? ""}
                              placeholder="https://…"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const prev = r.webhookUrl ?? "";
                                if (v !== prev)
                                  void patchRule(
                                    r.id,
                                    { webhook_url: v },
                                    "Webhook update failed",
                                  );
                              }}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
                            />
                          </label>
                          <label className="mt-2 block text-[10px] text-zinc-600">
                            Slack webhook
                            <input
                              key={`${r.id}-sl-${r.slackWebhookUrl ?? ""}`}
                              disabled={busy}
                              defaultValue={r.slackWebhookUrl ?? ""}
                              placeholder="https://hooks.slack.com/…"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const prev = r.slackWebhookUrl ?? "";
                                if (v !== prev)
                                  void patchRule(
                                    r.id,
                                    { slack_webhook_url: v },
                                    "Slack URL update failed",
                                  );
                              }}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
                            />
                          </label>
                          <label className="mt-2 block text-[10px] text-zinc-600">
                            PagerDuty routing key
                            <input
                              key={`${r.id}-pd-${r.pagerdutyRoutingKey ?? ""}`}
                              disabled={busy}
                              defaultValue={r.pagerdutyRoutingKey ?? ""}
                              placeholder="routing key"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const prev = r.pagerdutyRoutingKey ?? "";
                                if (v !== prev)
                                  void patchRule(
                                    r.id,
                                    { pagerduty_routing_key: v },
                                    "PagerDuty key update failed",
                                  );
                              }}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
                            />
                          </label>
                          <label className="mt-2 block text-[10px] text-zinc-600">
                            Runbook
                            <input
                              key={`${r.id}-rb-${r.runbookUrl ?? ""}`}
                              disabled={busy}
                              defaultValue={r.runbookUrl ?? ""}
                              placeholder="https://…"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const prev = r.runbookUrl ?? "";
                                if (v !== prev)
                                  void patchRule(
                                    r.id,
                                    { runbook_url: v },
                                    "Runbook update failed",
                                  );
                              }}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy || isViewer}
                      onClick={() => void removeRule(r.id)}
                      className="pulse-transition shrink-0 rounded-md border border-[var(--pulse-border-default)] bg-white/[0.02] px-2 py-1 text-[10px] font-medium text-zinc-400 hover:border-[var(--pulse-status-danger-border)] hover:bg-[var(--pulse-status-danger-bg)] hover:text-[var(--pulse-status-danger-fg)] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(e) => void createSilence(e)}
          className="pulse-card flex flex-col gap-3 p-5"
        >
          <h2 className="pulse-h3">Silence notifications</h2>
          <p className="pulse-caption">
            Temporarily suppress outbound notifications for one rule or all
            rules. Evaluation still runs; rows show silenced.
          </p>
          <label className="pulse-caption block">
            Scope
            <select
              className="pulse-select mt-1 w-full"
              value={silenceRuleId}
              onChange={(e) => setSilenceRuleId(e.target.value)}
            >
              <option value="">All rules</option>
              {rules.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="pulse-caption block">
            Duration (minutes, min 5)
            <input
              type="number" min={5}
              className="pulse-input mt-1 w-full"
              value={silenceDurationMins}
              onChange={(e) => setSilenceDurationMins(e.target.value)}
            />
          </label>
          <label className="pulse-caption block">
            Reason <span className="text-zinc-600">(optional)</span>
            <input
              className="pulse-input mt-1 w-full"
              value={silenceReason}
              placeholder="Deploy / drill / noise"
              onChange={(e) => setSilenceReason(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy} className="pulse-btn-secondary disabled:opacity-50">
            Add silence
          </button>
        </form>

        <div className="pulse-card-soft p-5">
          <h2 className="pulse-h3">Active silences <span className="ml-1 text-zinc-500">({silences.length})</span></h2>
          <ul className="mt-4 flex max-h-[min(40vh,320px)] flex-col gap-2 overflow-y-auto text-xs">
            {silences.length === 0 ? (
              <li className="text-zinc-500">No active silences.</li>
            ) : (
              silences.map((s) => {
                const ruleLabel =
                  s.ruleId == null
                    ? "All rules"
                    : (rules.find((x) => x.id === s.ruleId)?.name ??
                      `Rule #${s.ruleId}`);
                return (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-zinc-200">
                        {ruleLabel}
                      </div>
                      <div className="mt-1 text-zinc-500">
                        Until{" "}
                        {format(
                          new Date(s.endsAtMs),
                          "MMM d yyyy HH:mm:ss",
                        )}
                      </div>
                      {s.reason ? (
                        <div className="mt-1 text-zinc-600">{s.reason}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteSilence(s.id)}
                      className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      Lift
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </section>

      <section className="pulse-card p-5">
        <h2 className="pulse-h3">Last evaluation</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="pulse-table min-w-[800px]">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Metric / service</th>
                <th>Observed avg</th>
                <th>Threshold</th>
                <th>Runbook</th>
                <th>Silenced</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {evalRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-zinc-500">
                    No enabled rules to evaluate.
                  </td>
                </tr>
              ) : (
                evalRows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-zinc-200">{row.name}</td>
                    <td className="py-2 pr-3 text-zinc-400">
                      {row.metricName}
                      <br />
                      <span className="text-zinc-500">{row.service}</span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-300">
                      {row.observedAvg != null
                        ? row.observedAvg.toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-500">
                      {row.comparator} {row.threshold}
                    </td>
                    <td className="max-w-[200px] py-2 pr-3">
                      {row.runbookUrl ? (
                        <a
                          href={row.runbookUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-indigo-400 hover:text-indigo-300"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          row.silenced
                            ? "rounded-full bg-zinc-500/20 px-2 py-0.5 text-zinc-300"
                            : "text-zinc-600"
                        }
                      >
                        {row.silenced ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={
                          row.firing
                            ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200"
                            : "rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200"
                        }
                      >
                        {row.firing ? "Firing" : "OK"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            Evaluation history
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void loadHistory().catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
            }
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="pulse-table min-w-[720px]">
            <thead>
              <tr>
                <th>Time</th>
                <th>Rule</th>
                <th>Observed</th>
                <th>Silenced</th>
                <th>Firing</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-zinc-500">
                    No history rows yet. Run an evaluation.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">
                      {format(
                        new Date(h.evaluatedAtMs),
                        "MMM d HH:mm:ss",
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-200">
                      {h.ruleName ?? `Rule #${h.ruleId}`}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-400">
                      {h.observedAvg != null ? h.observedAvg.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">
                      {h.silenced ? "Yes" : "No"}
                    </td>
                    <td className="py-2">
                      <span
                        className={
                          h.firing
                            ? "text-amber-300"
                            : "text-emerald-400"
                        }
                      >
                        {h.firing ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
