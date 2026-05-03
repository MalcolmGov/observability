"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";

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

export function AlertsView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [evalRows, setEvalRows] = useState<EvalRow[]>([]);
  const [firingCount, setFiringCount] = useState(0);
  const [notificationsSent, setNotificationsSent] = useState(0);
  const [skippedDedupe, setSkippedDedupe] = useState(0);
  const [skippedSilence, setSkippedSilence] = useState(0);
  const [groupWindowMs, setGroupWindowMs] = useState(30 * 60 * 1000);
  const [silences, setSilences] = useState<SilenceRow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [silenceRuleId, setSilenceRuleId] = useState<string>("");
  const [silenceDurationMins, setSilenceDurationMins] = useState("60");
  const [silenceReason, setSilenceReason] = useState("");

  const [form, setForm] = useState({
    name: "",
    metric_name: "http.server.request_duration_ms",
    service: "checkout-api",
    comparator: "gt" as "gt" | "lt",
    threshold: "200",
    window_minutes: "5",
    webhook_url: "",
    slack_webhook_url: "",
    pagerduty_routing_key: "",
    runbook_url: "",
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

  useEffect(() => {
    void (async () => {
      try {
        await loadRules();
        await loadSilences();
        await loadHistory();
        await evaluate();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [evaluate, loadHistory, loadRules, loadSilences]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || `Rule ${new Date().toLocaleTimeString()}`,
          metric_name: form.metric_name,
          service: form.service,
          comparator: form.comparator,
          threshold: Number(form.threshold),
          window_minutes: Number(form.window_minutes),
          webhook_url: form.webhook_url.trim() || "",
          slack_webhook_url: form.slack_webhook_url.trim() || "",
          pagerduty_routing_key: form.pagerduty_routing_key.trim() || "",
          runbook_url: form.runbook_url.trim() || "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Create failed");
      }
      setForm((f) => ({
        ...f,
        name: "",
        webhook_url: "",
        slack_webhook_url: "",
        pagerduty_routing_key: "",
        runbook_url: "",
      }));
      await loadRules();
      await evaluate();
      await loadHistory();
    } catch (err) {
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
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Alerts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Threshold rules on rolling metric averages — a stepping stone to
            multi-window burn rates and anomaly helpers.
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
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10 disabled:opacity-50"
          >
            Re-evaluate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedDemo()}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            Load demo (+ default rule)
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          firingCount > 0
            ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
            : "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
        }`}
      >
        {firingCount > 0
          ? `${firingCount} rule(s) firing — inspect evaluated metrics below.`
          : "All enabled rules are within threshold (or have no data)."}
        <span className="mt-2 block text-[11px] text-zinc-400">
          Notifications sent (last eval): {notificationsSent}
          {skippedDedupe > 0
            ? ` · skipped dedupe: ${skippedDedupe}`
            : ""}
          {skippedSilence > 0
            ? ` · skipped (silenced): ${skippedSilence}`
            : ""}
          {` · group window ${Math.round(groupWindowMs / 60000)}m`}
        </span>
      </div>

      <section className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={(e) => void createRule(e)}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-5"
        >
          <h2 className="text-sm font-semibold text-zinc-100">New rule</h2>
          <label className="text-xs text-zinc-500">
            Name
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.name}
              placeholder="Checkout p95 budget"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Metric
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.metric_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, metric_name: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Service
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.service}
              onChange={(e) =>
                setForm((f) => ({ ...f, service: e.target.value }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-500">
              Comparator
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
                value={form.comparator}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    comparator: e.target.value as "gt" | "lt",
                  }))
                }
              >
                <option value="gt">greater than (&gt;)</option>
                <option value="lt">less than (&lt;)</option>
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Threshold
              <input
                type="number"
                step="any"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
                value={form.threshold}
                onChange={(e) =>
                  setForm((f) => ({ ...f, threshold: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="text-xs text-zinc-500">
            Window (minutes)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.window_minutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, window_minutes: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Webhook URL (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.webhook_url}
              placeholder="https://example.com/hooks/pulse"
              onChange={(e) =>
                setForm((f) => ({ ...f, webhook_url: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Slack incoming webhook (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.slack_webhook_url}
              placeholder="https://hooks.slack.com/services/…"
              onChange={(e) =>
                setForm((f) => ({ ...f, slack_webhook_url: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            PagerDuty routing key (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.pagerduty_routing_key}
              placeholder="Events API v2 integration key"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  pagerduty_routing_key: e.target.value,
                }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Runbook URL (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={form.runbook_url}
              placeholder="https://wiki.example.com/runbooks/checkout-latency"
              onChange={(e) =>
                setForm((f) => ({ ...f, runbook_url: e.target.value }))
              }
            />
          </label>
          <p className="text-[10px] text-zinc-600">
            Firing rules notify via generic webhook (JSON{" "}
            <code className="text-zinc-500">pulse.alert.firing</code>), Slack
            text, or PagerDuty Events v2. Dedupe uses a per-channel rolling
            window (
            <code className="text-zinc-500">PULSE_ALERT_GROUP_WINDOW_MS</code>
            ).
          </p>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-indigo-500 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            Save rule
          </button>
        </form>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">
            Saved rules ({rules.length})
          </h2>
          <ul className="mt-4 flex max-h-[min(50vh,400px)] flex-col gap-2 overflow-y-auto">
            {rules.length === 0 ? (
              <li className="text-sm text-zinc-500">No rules yet.</li>
            ) : (
              rules.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-3 py-2 text-xs"
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
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeRule(r.id)}
                      className="shrink-0 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
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

      <section className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={(e) => void createSilence(e)}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-5"
        >
          <h2 className="text-sm font-semibold text-zinc-100">
            Silence notifications
          </h2>
          <p className="text-[11px] text-zinc-500">
            Temporarily suppress outbound notifications for one rule or all
            rules (evaluation still runs; rows show silenced).
          </p>
          <label className="text-xs text-zinc-500">
            Scope
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={silenceRuleId}
              onChange={(e) => setSilenceRuleId(e.target.value)}
            >
              <option value="">All rules</option>
              {rules.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Duration (minutes, min 5)
            <input
              type="number"
              min={5}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={silenceDurationMins}
              onChange={(e) => setSilenceDurationMins(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Reason (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-zinc-100"
              value={silenceReason}
              placeholder="Deploy / drill / noise"
              onChange={(e) => setSilenceReason(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-white/15 bg-white/5 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:opacity-50"
          >
            Add silence
          </button>
        </form>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">
            Active silences ({silences.length})
          </h2>
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

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Last evaluation</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase text-zinc-500">
                <th className="py-2 pr-3">Rule</th>
                <th className="py-2 pr-3">Metric / service</th>
                <th className="py-2 pr-3">Observed avg</th>
                <th className="py-2 pr-3">Threshold</th>
                <th className="py-2 pr-3">Runbook</th>
                <th className="py-2 pr-3">Silenced</th>
                <th className="py-2">State</th>
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
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase text-zinc-500">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Rule</th>
                <th className="py-2 pr-3">Observed</th>
                <th className="py-2 pr-3">Silenced</th>
                <th className="py-2">Firing</th>
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
