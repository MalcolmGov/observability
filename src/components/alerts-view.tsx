"use client";

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
  runbookUrl: string | null;
};

export function AlertsView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [evalRows, setEvalRows] = useState<EvalRow[]>([]);
  const [firingCount, setFiringCount] = useState(0);
  const [webhooksSent, setWebhooksSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    metric_name: "http.server.request_duration_ms",
    service: "checkout-api",
    comparator: "gt" as "gt" | "lt",
    threshold: "200",
    window_minutes: "5",
    webhook_url: "",
    runbook_url: "",
  });

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
      webhooksSent?: number;
    };
    setEvalRows(data.results);
    setFiringCount(data.firingCount);
    setWebhooksSent(data.webhooksSent ?? 0);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadRules();
        await evaluate();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [evaluate, loadRules]);

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
          runbook_url: form.runbook_url.trim() || "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Create failed");
      }
      setForm((f) => ({ ...f, name: "", webhook_url: "", runbook_url: "" }));
      await loadRules();
      await evaluate();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchRuleRunbook(id: number, runbook_url: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, runbook_url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Runbook update failed",
        );
      }
      await loadRules();
      await evaluate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Runbook update failed");
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
            onClick={() => void evaluate().catch((e) => setError(String(e)))}
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
        {webhooksSent > 0 ? (
          <span className="mt-2 block text-[11px] text-zinc-400">
            Webhook posts attempted: {webhooksSent} ( firing rules with URLs ).
          </span>
        ) : null}
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
            On each evaluation, firing rules with a URL receive a JSON POST (
            <code className="text-zinc-500">pulse.alert.firing</code>). Use a
            request inspector for local tests.
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
                        {r.runbookUrl ? " · runbook" : ""}
                      </div>
                      <label className="mt-2 block text-[10px] text-zinc-600">
                        Runbook
                        <input
                          key={`${r.id}-${r.runbookUrl ?? ""}`}
                          disabled={busy}
                          defaultValue={r.runbookUrl ?? ""}
                          placeholder="https://…"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const prev = r.runbookUrl ?? "";
                            if (v !== prev)
                              void patchRuleRunbook(r.id, v);
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

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Last evaluation</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase text-zinc-500">
                <th className="py-2 pr-3">Rule</th>
                <th className="py-2 pr-3">Metric / service</th>
                <th className="py-2 pr-3">Observed avg</th>
                <th className="py-2 pr-3">Threshold</th>
                <th className="py-2 pr-3">Runbook</th>
                <th className="py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {evalRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-zinc-500">
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
    </div>
  );
}
