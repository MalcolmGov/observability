"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/components/auth-provider";
import { generateIncidentRcaAction } from "@/app/actions/incident-rca";

// ── Types ────────────────────────────────────────────────────────
type Severity = "critical" | "warning" | "info";

interface Incident {
  ruleId: number;
  ruleName: string;
  service: string;
  severity: Severity;
  metricName: string | null;
  comparator: string | null;
  threshold: number | null;
  observedAvg: number | null;
  marketScope: string | null;
  environment: string;
  runbookUrl: string | null;
  evaluatedAtMs: number;
}

interface HistoryEntry {
  id: number;
  ruleId: number;
  ruleName: string | null;
  evaluatedAtMs: number;
  firing: boolean;
  observedAvg: number | null;
  silenced: boolean;
}

interface LogEntry {
  id?: number;
  ts: number;
  level: string;
  message: string;
  service: string;
}

// ── Helpers ──────────────────────────────────────────────────────
const SEV: Record<Severity, { bg: string; border: string; badge: string; badgeBg: string; dot: string }> = {
  critical: { bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.28)", badge: "#f87171", badgeBg: "rgba(248,113,113,0.15)", dot: "bg-red-400" },
  warning:  { bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.22)",  badge: "#fbbf24", badgeBg: "rgba(251,191,36,0.13)",  dot: "bg-amber-400" },
  info:     { bg: "rgba(56,189,248,0.05)",  border: "rgba(56,189,248,0.18)",  badge: "#38bdf8", badgeBg: "rgba(56,189,248,0.1)",   dot: "bg-sky-400" },
};

function AgeTimer({ ms }: { ms: number }) {
  const [age, setAge] = useState(() => formatDistanceToNowStrict(new Date(ms)));
  useEffect(() => {
    const id = setInterval(() => setAge(formatDistanceToNowStrict(new Date(ms))), 10_000);
    return () => clearInterval(id);
  }, [ms]);
  return <span>{age} ago</span>;
}

function SevIcon({ s }: { s: Severity }) {
  return <span>{s === "critical" ? "🔴" : s === "warning" ? "🟡" : "🔵"}</span>;
}

// ── Sparkline (observed avg history) ────────────────────────────
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 120, h = 32, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path d={d} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
    </svg>
  );
}

// ── Timeline entry ───────────────────────────────────────────────
function TimelineRow({ entry }: { entry: HistoryEntry }) {
  const icon = entry.silenced ? "🔇" : entry.firing ? "🔴" : "✅";
  const label = entry.silenced ? "Silenced" : entry.firing ? "Still firing" : "Resolved";
  return (
    <div className="flex items-start gap-2.5 text-[11px]">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-zinc-300">{label}</span>
        {entry.observedAvg != null && (
          <span className="ml-2 font-mono text-zinc-500">({entry.observedAvg.toFixed(2)})</span>
        )}
        <span className="ml-2 text-zinc-600">{format(new Date(entry.evaluatedAtMs), "HH:mm:ss")}</span>
      </div>
    </div>
  );
}

// ── AI Root Cause Analysis Panel ─────────────────────────────────
function AiRcaPanel({ incident, logs }: { incident: Incident; logs: LogEntry[] }) {
  const [rcaResult, setRcaResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateIncidentRcaAction(
        {
          ruleName: incident.ruleName,
          service: incident.service,
          severity: incident.severity,
          metricStr: incident.metricName ? `${incident.metricName} ${incident.comparator} ${incident.threshold}` : null,
          observedAvg: incident.observedAvg,
          evaluatedAtMs: incident.evaluatedAtMs,
        },
        logs
      );
      if (res.success) {
        setRcaResult(res.markdown);
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError("Failed to reach AI service.");
    } finally {
      setLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    // A very lightweight parser to handle bold and newlines
    let html = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/### (.*?)\n/g, '<h3 className="mt-4 mb-2 text-[13px] font-bold text-white">$1</h3>')
      .replace(/- (.*)/g, '<li className="ml-4 list-disc">$1</li>')
      .replace(/1\. (.*)/g, '<li className="ml-4 list-decimal">$1</li>')
      .replace(/2\. (.*)/g, '<li className="ml-4 list-decimal">$1</li>')
      .replace(/\n/g, "<br/>");
    return <div dangerouslySetInnerHTML={{ __html: html }} className="text-[12px] leading-relaxed text-zinc-300" />;
  };

  return (
    <div className="rounded-xl p-4 mt-5" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#a78bfa" }}>AI Root Cause Analysis</span>
        </div>
        {!rcaResult && !loading && (
          <button onClick={handleGenerate} className="pulse-btn-secondary px-3 py-1 text-[11px]" style={{ color: "#a78bfa" }}>
            Generate Brief ✨
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-400">
          <span className="animate-spin">⏳</span> Analyzing logs and telemetry...
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {rcaResult && !loading && (
        <div className="mt-2 rounded bg-black/20 p-3">
          {renderMarkdown(rcaResult)}
          <div className="mt-3 text-right">
             <button onClick={handleGenerate} className="text-[10px] text-zinc-500 hover:text-zinc-300">Regenerate ↺</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Incident detail panel ────────────────────────────────────────
function IncidentDetail({
  incident,
  history,
  onSilence,
}: {
  incident: Incident;
  history: HistoryEntry[];
  onSilence: (ruleId: number) => Promise<void>;
}) {
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [silencing, setSilencing] = useState(false);
  const s = SEV[incident.severity];
  const ruleHistory = history.filter(h => h.ruleId === incident.ruleId).slice(0, 12);
  const sparkPoints = ruleHistory.filter(h => h.observedAvg != null).reverse().map(h => h.observedAvg!);
  const metricStr = incident.metricName
    ? `${incident.metricName} ${incident.comparator === "gt" ? ">" : "<"} ${incident.threshold}`
    : null;

  // Fetch recent error logs for this service
  useEffect(() => {
    fetch(`/api/v1/query/logs?service=${encodeURIComponent(incident.service)}&level=error&limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { entries?: LogEntry[] } | null) => { if (data?.entries) setLogs(data.entries.slice(0, 8)); })
      .catch(() => null);
  }, [incident.service, incident.ruleId]);

  async function handleSilence() {
    setSilencing(true);
    try { await onSilence(incident.ruleId); } finally { setSilencing(false); }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 px-6 py-5" style={{ background: `${s.bg}`, borderBottom: `1px solid ${s.border}` }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{ background: s.badgeBg, border: `1px solid ${s.border}` }}>
            <SevIcon s={incident.severity} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white">{incident.ruleName}</h2>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: s.badgeBg, color: s.badge }}>
                {incident.severity}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-zinc-400">
              <span>🔧 <span className="text-zinc-200">{incident.service}</span></span>
              {metricStr && <span className="font-mono text-zinc-300">{metricStr}</span>}
              {incident.observedAvg != null && (
                <span>Observed: <strong style={{ color: s.badge }}>{incident.observedAvg.toFixed(2)}</strong></span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              <AgeTimer ms={incident.evaluatedAtMs} /> · {format(new Date(incident.evaluatedAtMs), "dd MMM HH:mm:ss")}
              {incident.environment && <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px]">{incident.environment}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          <a href={`/metrics?service=${encodeURIComponent(incident.service)}${incident.metricName ? `&metric=${encodeURIComponent(incident.metricName)}` : ""}&range=1h`}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            style={{ background: "rgba(6,214,199,0.1)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.25)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.1)"; }}>
            📊 Metrics
          </a>
          <a href={`/logs?service=${encodeURIComponent(incident.service)}&level=error`}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
            📝 Error Logs
          </a>
          <a href={`/traces?service=${encodeURIComponent(incident.service)}&errorsOnly=1`}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
            🔀 Traces
          </a>
          {incident.runbookUrl && (
            <a href={incident.runbookUrl} target="_blank" rel="noopener noreferrer"
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
              style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.22)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.08)"; }}>
              📓 Runbook
            </a>
          )}
          {isViewer ? (
            <span className="self-center px-2 text-[11px] text-amber-500">Viewers cannot silence incidents</span>
          ) : (
            <button type="button" onClick={() => void handleSilence()} disabled={silencing}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
              style={{ background: "rgba(167,139,250,0.08)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.22)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.08)"; }}>
              {silencing ? "Silencing…" : "🔇 Silence 1h"}
            </button>
          )}
        </div>

        {/* Sparkline + current value */}
        {sparkPoints.length >= 2 && (
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-400">Metric trend (last {sparkPoints.length} evals)</span>
              <span className="font-mono text-sm font-bold" style={{ color: s.badge }}>
                {incident.observedAvg?.toFixed(2) ?? "—"}
              </span>
            </div>
            <Sparkline points={sparkPoints} color={s.badge} />
          </div>
        )}

        {/* Incident timeline */}
        {ruleHistory.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Incident timeline</div>
            <div className="flex flex-col gap-2">
              {ruleHistory.map(h => <TimelineRow key={h.id} entry={h} />)}
            </div>
          </div>
        )}

        {/* Recent error logs */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Recent error logs</div>
          {logs.length === 0 ? (
            <div className="text-[11px] text-zinc-600">No error logs found for {incident.service}.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {logs.map((l, i) => (
                <div key={l.id ?? i} className="flex items-start gap-2 rounded-lg p-2"
                  style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}>
                  <span className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-bold uppercase"
                    style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>{l.level}</span>
                  <span className="font-mono text-[11px] leading-relaxed text-zinc-300 break-all">{l.message}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-zinc-600">{format(new Date(l.ts), "HH:mm:ss")}</span>
                </div>
              ))}
            </div>
          )}
          <a href={`/logs?service=${encodeURIComponent(incident.service)}&level=error`}
            className="mt-2 block text-right text-[11px] transition" style={{ color: "#06d6c7" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#5eead4"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#06d6c7"; }}>
            View all logs →
          </a>
        </div>

        {/* AI Copilot Panel */}
        <AiRcaPanel incident={incident} logs={logs} />

      </div>
    </div>
  );
}

// ── Incident queue card ──────────────────────────────────────────
function IncidentCard({ incident, selected, onClick }: { incident: Incident; selected: boolean; onClick: () => void }) {
  const s = SEV[incident.severity];
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-2xl p-4 text-left transition-all"
      style={{
        background: selected ? s.badgeBg : "rgba(255,255,255,0.025)",
        border: `1px solid ${selected ? s.border : "rgba(255,255,255,0.07)"}`,
        boxShadow: selected ? `0 0 0 1px ${s.border}` : "none",
      }}>
      <div className="flex items-start gap-2.5">
        {/* Sev dot */}
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className={`relative flex size-2 shrink-0`}>
            {selected && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.dot} opacity-60`} />}
            <span className={`relative inline-flex size-2 rounded-full ${s.dot}`} />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white">{incident.ruleName}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="truncate">{incident.service}</span>
            <span>·</span>
            <AgeTimer ms={incident.evaluatedAtMs} />
          </div>
          {incident.observedAvg != null && (
            <div className="mt-1.5 font-mono text-[11px]" style={{ color: s.badge }}>
              {incident.observedAvg.toFixed(2)}
              {incident.threshold != null && (
                <span className="ml-1 text-zinc-600">
                  / {incident.comparator === "gt" ? ">" : "<"} {incident.threshold}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ background: s.badgeBg, color: s.badge }}>
          {incident.severity}
        </span>
      </div>
    </button>
  );
}

// ── Main view ────────────────────────────────────────────────────
export function IncidentCommandView() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [incRes, histRes] = await Promise.all([
      fetch("/api/v1/alerts/notifications?windowMs=86400000&limit=50"),
      fetch("/api/v1/alerts/history?limit=200"),
    ]);
    if (incRes.ok) {
      const d = (await incRes.json()) as { notifications: Incident[] };
      setIncidents(d.notifications);
      // Auto-select first critical if nothing selected
      setSelected(prev => {
        if (prev) {
          const refreshed = d.notifications.find(n => n.ruleId === prev.ruleId);
          return refreshed ?? prev;
        }
        const first = d.notifications.find(n => n.severity === "critical") ?? d.notifications[0] ?? null;
        return first;
      });
    }
    if (histRes.ok) {
      const d = (await histRes.json()) as { entries: HistoryEntry[] };
      setHistory(d.entries);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  async function silenceRule(ruleId: number) {
    await fetch("/api/v1/alerts/silences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId, durationMinutes: 60, reason: "Silenced from Incident Command" }),
    });
    await load();
  }

  async function seedDemo() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await fetch("/api/v1/demo/incidents", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; rulesCreated?: number; historyRowsInserted?: number };
      if (data.ok) {
        setSeedMsg(`✅ Seeded ${data.rulesCreated ?? 0} incidents with ${data.historyRowsInserted ?? 0} history snapshots`);
        await load();
      } else {
        setSeedMsg("❌ Seed failed — check console");
      }
    } catch {
      setSeedMsg("❌ Network error during seed");
    } finally {
      setSeeding(false);
    }
  }

  const critical = incidents.filter(i => i.severity === "critical");
  const warning  = incidents.filter(i => i.severity === "warning");
  const info     = incidents.filter(i => i.severity === "info");
  const sorted   = [...critical, ...warning, ...info];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-3">🚨</div>
          <div className="text-sm text-zinc-500">Loading incident data…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">

      {/* ── Mission control header ── */}
      <div className="shrink-0 px-6 py-4"
        style={{ background: "rgba(4,8,15,0.8)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold text-white">Incident Command Centre</h1>
              <p className="text-[11px] text-zinc-500">
                {incidents.length === 0 ? "All systems operational" : `${incidents.length} active incident${incidents.length !== 1 ? "s" : ""} · auto-refreshes every 30s`}
              </p>
            </div>
            {/* Severity counts */}
            <div className="hidden items-center gap-2 sm:flex">
              {critical.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                  </span>
                  {critical.length} critical
                </span>
              )}
              {warning.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
                  {warning.length} warning
                </span>
              )}
              {info.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: "rgba(56,189,248,0.1)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.2)" }}>
                  {info.length} info
                </span>
              )}
              {incidents.length === 0 && (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                  ✅ All clear
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[10px] text-zinc-600">
                Updated {format(lastRefresh, "HH:mm:ss")}
              </span>
            )}
            <button type="button" onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition"
              style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
              ↻ Refresh
            </button>
            <a href="/alerts"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition"
              style={{ background: "rgba(255,255,255,0.04)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}>
              Manage rules →
            </a>
          </div>
        </div>
      </div>

      {/* ── Split pane ── */}
      {incidents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="text-6xl mb-5">✅</div>
            <h2 className="text-xl font-bold text-emerald-300">All systems operational</h2>
            <p className="mt-2 mb-6 text-sm text-zinc-500">
              No alert rules are breaching thresholds right now. Load the incident demo to see the Command Centre in action.
            </p>
            {seedMsg && (
              <p className="mb-4 text-[12px]" style={{ color: seedMsg.startsWith("✅") ? "#34d399" : "#f87171" }}>{seedMsg}</p>
            )}
            <button type="button" onClick={() => void seedDemo()} disabled={seeding}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition disabled:opacity-60"
              style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }}
              onMouseEnter={e => { if (!seeding) (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.25)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.15)"; }}>
              {seeding ? (
                <><span className="animate-spin">⏳</span> Seeding incidents…</>
              ) : (
                <>🚨 Load Demo Incidents</>
              )}
            </button>
            <p className="mt-4 text-[11px] text-zinc-600">
              Seeds 4 realistic incidents (2 critical, 1 warning, 1 info) with metric history and error logs.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Desktop split-pane (md+) ── */}
          <div className="hidden flex-1 overflow-hidden md:flex">
            {/* Left: incident queue */}
            <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06]"
              style={{ background: "rgba(4,8,15,0.6)" }}>
              <div className="px-4 pt-4 pb-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  Incident queue · {sorted.length}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-4">
                {sorted.map(inc => (
                  <IncidentCard
                    key={inc.ruleId}
                    incident={inc}
                    selected={selected?.ruleId === inc.ruleId}
                    onClick={() => setSelected(inc)}
                  />
                ))}
              </div>
            </div>
            {/* Right: detail */}
            <div className="flex-1 overflow-hidden">
              {selected ? (
                <IncidentDetail incident={selected} history={history} onSilence={silenceRule} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                  Select an incident to investigate
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile: full-width queue + bottom-sheet detail ── */}
          <div className="flex flex-1 flex-col overflow-y-auto md:hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Incident queue · {sorted.length}
              </div>
            </div>
            <div className="flex flex-col gap-2 px-3 pb-6">
              {sorted.map(inc => (
                <IncidentCard
                  key={inc.ruleId}
                  incident={inc}
                  selected={false}
                  onClick={() => setSelected(inc)}
                />
              ))}
            </div>
          </div>

          {/* Mobile bottom sheet */}
          {selected && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setSelected(null)} aria-hidden />
              {/* Sheet */}
              <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl"
                style={{ background: "rgba(6,10,20,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-zinc-700" />
                </div>
                {/* Back button */}
                <div className="flex items-center gap-2 border-b px-4 py-3"
                  style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                  <button type="button" onClick={() => setSelected(null)}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 transition hover:text-zinc-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    All incidents
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <IncidentDetail incident={selected} history={history} onSilence={silenceRule} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
