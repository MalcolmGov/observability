"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  INTEGRATION_CATEGORIES,
  ALL_INTEGRATIONS,
  type Integration,
  type IntegrationCategory,
} from "@/lib/integrations-data";

// ── Status badge ────────────────────────────────────────────────
function StatusBadge({ status, connected }: { status: Integration["status"]; connected?: boolean }) {
  if (connected) {
    return (
      <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(52,211,153,0.12)", color: "#6ee7b7", border: "1px solid rgba(52,211,153,0.25)" }}>
        <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
        Connected
      </span>
    );
  }
  if (status === "native") {
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(56,189,248,0.10)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.2)" }}>
        Available
      </span>
    );
  }
  if (status === "configured") {
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(251,191,36,0.10)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.2)" }}>
        Configurable
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: "rgba(255,255,255,0.04)", color: "#71717a", border: "1px solid rgba(255,255,255,0.08)" }}>
      Coming soon
    </span>
  );
}

// ── Signal chips ────────────────────────────────────────────────
const SIGNAL_META = {
  traces: { label: "Distributed Traces", icon: "🔀", color: "#a78bfa" },
  metrics: { label: "Metrics", icon: "📊", color: "#06d6c7" },
  logs: { label: "Logs", icon: "📝", color: "#38bdf8" },
  alerts: { label: "Alerts", icon: "🔔", color: "#fb923c" },
} as const;

// ── Step block ──────────────────────────────────────────────────
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-1">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: "rgba(6,214,199,0.15)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.3)" }}>
          {n}
        </div>
        <div className="w-px flex-1" style={{ background: "rgba(6,214,199,0.12)", minHeight: 16 }} />
      </div>
      <div className="flex-1 pb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── Env var callout ─────────────────────────────────────────────
function EnvCallout() {
  const [copied, setCopied] = useState<string | null>(null);
  const vars = [
    { key: "PULSE_INGEST_API_KEY", val: "your-secret-key", desc: "Required for all ingest requests" },
    { key: "OTEL_EXPORTER_OTLP_ENDPOINT", val: "http://localhost:3001/api/v1/ingest/otlp", desc: "OTLP exporter target" },
  ];
  function copy(v: string, key: string) {
    void navigator.clipboard.writeText(v);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }
  return (
    <div className="rounded-xl border p-4"
      style={{ background: "rgba(6,214,199,0.04)", border: "1px solid rgba(6,214,199,0.15)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm">🔑</span>
        <span className="text-xs font-semibold text-zinc-300">Environment variables</span>
      </div>
      <div className="flex flex-col gap-2">
        {vars.map(v => (
          <div key={v.key} className="flex items-start justify-between gap-2 rounded-lg p-2"
            style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] font-semibold" style={{ color: "#06d6c7" }}>{v.key}</div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{v.val}</div>
              <div className="mt-0.5 text-[10px] text-zinc-600">{v.desc}</div>
            </div>
            <button type="button" onClick={() => copy(v.val, v.key)}
              className="shrink-0 rounded px-2 py-1 text-[10px] font-medium transition"
              style={{ background: "rgba(6,214,199,0.08)", color: copied === v.key ? "#34d399" : "#06d6c7", border: "1px solid rgba(6,214,199,0.2)" }}>
              {copied === v.key ? "✓" : "Copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Setup drawer ────────────────────────────────────────────────
function SetupDrawer({
  integration,
  category,
  connected,
  onClose,
}: {
  integration: Integration;
  category: IntegrationCategory;
  connected: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    // Trap focus inside drawer
    drawerRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyCode() {
    if (!integration.setupCode) return;
    void navigator.clipboard.writeText(integration.setupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isComingSoon = integration.status === "coming_soon";
  const signals = integration.signals ?? ["metrics"];
  const prereqs = integration.prerequisites ?? ["PULSE_INGEST_API_KEY set in your environment"];
  const verifyIn = integration.verifyIn ?? [{ label: "Dashboard", href: "/" }, { label: "Metrics explorer", href: "/metrics" }];

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`${integration.name} setup`}>
      {/* Backdrop */}
      <button type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-[3px]"
        onClick={onClose} aria-label="Close setup drawer" />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative ml-auto flex h-full w-full max-w-[520px] flex-col outline-none"
        style={{ background: "#04080f", borderLeft: "1px solid rgba(6,214,199,0.18)", boxShadow: "-32px 0 100px rgba(0,0,0,0.6)" }}
      >
        {/* ── Drawer header ── */}
        <div className="shrink-0 border-b border-white/[0.06]"
          style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.07) 0%, rgba(4,8,15,0.9) 100%)" }}>
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                style={{ background: `${category.color}18`, border: `1px solid ${category.color}30` }}>
                {integration.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">{integration.name}</h2>
                  <StatusBadge status={integration.status} connected={connected} />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span>{category.emoji}</span>
                  <span>{category.label}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          {/* Signal chips */}
          <div className="flex flex-wrap gap-2 px-6 pb-4">
            {signals.map(sig => {
              const m = SIGNAL_META[sig];
              return (
                <span key={sig} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: `${m.color}12`, color: m.color, border: `1px solid ${m.color}28` }}>
                  <span>{m.icon}</span>
                  {m.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {isComingSoon ? (
            /* Coming soon state */
            <div className="flex flex-col items-center justify-center gap-4 py-24 px-8 text-center">
              <span className="text-5xl">🚧</span>
              <h3 className="text-lg font-semibold text-zinc-100">Coming soon</h3>
              <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
                This integration is on our roadmap. In the meantime, you can use the{" "}
                <strong className="text-zinc-300">OTel Collector</strong> or{" "}
                <strong className="text-zinc-300">Custom JSON</strong> ingest to send data from {integration.name}.
              </p>
              <a href="/integrations" className="mt-2 rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: "rgba(6,214,199,0.12)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.25)" }}>
                See available integrations
              </a>
            </div>
          ) : (
            <div className="px-6 py-6">
              {/* What you'll get */}
              <div className="mb-6 rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {integration.description}{" "}
                  <span className="text-zinc-500">
                    Data flows automatically into your Pulse dashboards, alerts, and explorers.
                  </span>
                </p>
              </div>

              {/* Step 1: Prerequisites */}
              <Step n={1} title="Before you start — check prerequisites">
                <ul className="flex flex-col gap-2">
                  {prereqs.map((p, i) => (
                    <li key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span className="mt-0.5 shrink-0 text-emerald-400">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <circle cx="6.5" cy="6.5" r="6" stroke="rgba(52,211,153,0.4)" />
                          <path d="M3.5 6.5L5.5 8.5L9.5 4.5" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="text-[12px] leading-relaxed text-zinc-300">{p}</span>
                    </li>
                  ))}
                </ul>
              </Step>

              {/* Step 2: Environment variables */}
              <Step n={2} title="Configure your environment">
                <EnvCallout />
              </Step>

              {/* Step 3: Install & configure */}
              {integration.setupCode && (
                <Step n={3} title="Install & configure">
                  {/* Language label */}
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}>
                      {integration.setupLang ?? "bash"}
                    </span>
                    {/* Big copy button */}
                    <button type="button" onClick={copyCode}
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                      style={copied
                        ? { background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }
                        : { background: "rgba(6,214,199,0.1)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.25)" }}>
                      {copied ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                            <path d="M1.5 6L4.5 9L10.5 3" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="4.5" y="1.5" width="6" height="8" rx="1" />
                            <path strokeLinecap="round" d="M2.5 3.5H2a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1v-.5" />
                          </svg>
                          Copy code
                        </>
                      )}
                    </button>
                  </div>
                  {/* Code block */}
                  <div className="relative rounded-xl overflow-hidden"
                    style={{ border: "1px solid rgba(6,214,199,0.12)" }}>
                    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b"
                      style={{ background: "rgba(6,214,199,0.05)", borderColor: "rgba(6,214,199,0.1)" }}>
                      <span className="size-2.5 rounded-full bg-white/10" />
                      <span className="size-2.5 rounded-full bg-white/10" />
                      <span className="size-2.5 rounded-full bg-white/10" />
                      <span className="ml-2 font-mono text-[10px] text-zinc-600">setup.{integration.setupLang ?? "sh"}</span>
                    </div>
                    <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-[1.7] text-zinc-300 whitespace-pre"
                      style={{ background: "rgba(0,0,0,0.5)" }}>
                      {integration.setupCode}
                    </pre>
                  </div>
                </Step>
              )}

              {/* Step 4: Verify */}
              <Step n={integration.setupCode ? 4 : 3} title="Verify your connection in Pulse">
                <p className="mb-3 text-[12px] text-zinc-500">
                  After connecting, data appears within 30–60 seconds. Check these pages:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {verifyIn.map(v => (
                    <a key={v.href} href={v.href}
                      className="group flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#e4e4e7" }}
                      onMouseEnter={e => {
                        const el = e.currentTarget;
                        el.style.background = "rgba(6,214,199,0.08)";
                        el.style.border = "1px solid rgba(6,214,199,0.25)";
                        el.style.color = "#06d6c7";
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget;
                        el.style.background = "rgba(255,255,255,0.03)";
                        el.style.border = "1px solid rgba(255,255,255,0.07)";
                        el.style.color = "#e4e4e7";
                      }}>
                      <span>{v.label}</span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M2 7h10M8 3l4 4-4 4" />
                      </svg>
                    </a>
                  ))}
                </div>
              </Step>

              {/* Need help callout */}
              <div className="mt-2 rounded-xl p-4"
                style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.12)" }}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-lg">💡</span>
                  <div>
                    <div className="text-xs font-semibold text-zinc-300">Need help?</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Load demo data from the <a href="/" className="font-medium" style={{ color: "#38bdf8" }}>Dashboard</a> to see how connected data looks before your own data arrives.
                      All Pulse ingest endpoints accept data immediately — no account setup required.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        {!isComingSoon && (
          <div className="shrink-0 border-t border-white/[0.06] px-6 py-4"
            style={{ background: "rgba(4,8,15,0.95)" }}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-zinc-600">
                Using OpenTelemetry standard · No vendor lock-in
              </span>
              <button type="button" onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: "rgba(6,214,199,0.1)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.22)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.18)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.1)"; }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Integration card ────────────────────────────────────────────
function IntegrationCard({
  integration,
  accentColor,
  connected,
  onClick,
}: {
  integration: Integration;
  accentColor: string;
  connected: boolean;
  onClick: () => void;
}) {
  const isAvailable = integration.status !== "coming_soon";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200"
      style={{
        border: connected ? "1px solid rgba(52,211,153,0.2)" : "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.border = `1px solid ${accentColor}33`;
        el.style.background = `${accentColor}08`;
        el.style.transform = "translateY(-1px)";
        el.style.boxShadow = `0 8px 32px ${accentColor}12`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.border = connected ? "1px solid rgba(52,211,153,0.2)" : "1px solid rgba(255,255,255,0.06)";
        el.style.background = "rgba(255,255,255,0.02)";
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{integration.emoji}</span>
        <StatusBadge status={integration.status} connected={connected} />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">{integration.name}</div>
        <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{integration.description}</div>
      </div>
      {isAvailable && (
        <div className="mt-auto text-[10px] font-medium transition-colors"
          style={{ color: accentColor }}>
          View setup →
        </div>
      )}
    </button>
  );
}

// ── Main view ───────────────────────────────────────────────────
export function IntegrationsView() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selected, setSelected] = useState<{ integration: Integration; category: IntegrationCategory } | null>(null);
  const [connectedServices, setConnectedServices] = useState<string[]>([]);

  // Load which services are actively sending data
  useEffect(() => {
    void fetch("/api/v1/services")
      .then(r => r.json())
      .then((d: { services: string[] }) => setConnectedServices(d.services ?? []))
      .catch(() => {});
  }, []);

  // An integration is "connected" if any service name contains its id keyword
  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const svc of connectedServices) {
      for (const cat of INTEGRATION_CATEGORIES) {
        for (const intg of cat.integrations) {
          if (svc.toLowerCase().includes(intg.id.toLowerCase()) ||
            intg.id === "otlp-http" || intg.id === "otel-collector") {
            if (connectedServices.length > 0) ids.add(intg.id);
          }
        }
      }
    }
    return ids;
  }, [connectedServices]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return INTEGRATION_CATEGORIES.map(cat => ({
      ...cat,
      integrations: cat.integrations.filter(i =>
        (activeCategory === "all" || cat.id === activeCategory) &&
        (q === "" || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q))
      ),
    })).filter(cat => cat.integrations.length > 0);
  }, [search, activeCategory]);

  const totalConnected = connectedIds.size;
  const totalAvailable = ALL_INTEGRATIONS.filter(i => i.status !== "coming_soon").length;

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] px-6 py-8"
        style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.08) 0%, rgba(56,189,248,0.05) 50%, rgba(4,8,15,0.6) 100%)" }}>
        <div className="relative z-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Integrations
              </h1>
              <p className="mt-1 max-w-xl text-sm text-zinc-400">
                Connect any data source — cloud, containers, databases, CI/CD, AI — via OTLP, Prometheus, or JSON.
                No proprietary agents required.
              </p>
            </div>
            <div className="flex items-center gap-6 text-center">
              <div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: "#06d6c7" }}>{totalConnected}</div>
                <div className="text-[11px] text-zinc-500">Connected</div>
              </div>
              <div className="h-8 w-px bg-white/[0.08]" />
              <div>
                <div className="text-2xl font-bold tabular-nums text-zinc-100">{totalAvailable}</div>
                <div className="text-[11px] text-zinc-500">Available</div>
              </div>
              <div className="h-8 w-px bg-white/[0.08]" />
              <div>
                <div className="text-2xl font-bold tabular-nums text-zinc-100">{INTEGRATION_CATEGORIES.length}</div>
                <div className="text-[11px] text-zinc-500">Categories</div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5"
            style={{ background: "rgba(0,0,0,0.3)", maxWidth: 460 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="rgba(6,214,199,0.5)" strokeWidth="1.5">
              <circle cx="9" cy="9" r="5.5" /><path strokeLinecap="round" d="M13.5 13.5L17 17" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search integrations…"
              className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-400">✕</button>
            )}
          </div>
        </div>
      </header>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory("all")}
          className="rounded-full px-3 py-1.5 text-xs font-medium transition"
          style={activeCategory === "all"
            ? { background: "rgba(6,214,199,0.15)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.3)" }
            : { background: "rgba(255,255,255,0.03)", color: "#71717a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          All
        </button>
        {INTEGRATION_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat.id ? "all" : cat.id)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition"
            style={activeCategory === cat.id
              ? { background: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}40` }
              : { background: "rgba(255,255,255,0.03)", color: "#71717a", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* Integration grid by category */}
      {filteredCategories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-sm text-zinc-500">No integrations match &ldquo;{search}&rdquo;</p>
          <button type="button" onClick={() => setSearch("")} className="text-sm font-medium" style={{ color: "#06d6c7" }}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {filteredCategories.map(cat => (
            <section key={cat.id}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg text-lg"
                  style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}25` }}>
                  {cat.emoji}
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">{cat.label}</h2>
                  <p className="text-[11px] text-zinc-500">{cat.description}</p>
                </div>
                <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] text-zinc-600"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {cat.integrations.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cat.integrations.map(intg => (
                  <IntegrationCard
                    key={intg.id}
                    integration={intg}
                    accentColor={cat.color}
                    connected={connectedIds.has(intg.id)}
                    onClick={() => setSelected({ integration: intg, category: cat })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Setup drawer */}
      {selected && (
        <SetupDrawer
          integration={selected.integration}
          category={selected.category}
          connected={connectedIds.has(selected.integration.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
