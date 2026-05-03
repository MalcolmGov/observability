"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { planNlQueryAction } from "@/app/actions/nl-query";

// ── Types ───────────────────────────────────────────────────────
type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  action?: { label: string; href: string };
  timestamp: number;
}

// ── Suggested prompts by context ────────────────────────────────
const SUGGESTIONS: { label: string; prompt: string; icon: string }[] = [
  { icon: "🔴", label: "Error spike?", prompt: "Show me error logs from checkout-api in the last hour" },
  { icon: "🐌", label: "Latency issue?", prompt: "Which service has the highest p95 latency right now?" },
  { icon: "📉", label: "Throughput drop?", prompt: "Show throughput for my services over the last 6 hours" },
  { icon: "🔍", label: "Trace a request", prompt: "Find slow traces over 500ms in the last 15 minutes" },
  { icon: "⚠️", label: "Recent errors", prompt: "Show me all error and fatal logs in the last 24 hours" },
  { icon: "📊", label: "CPU metrics", prompt: "Show me cpu.utilization metrics for the last hour" },
];

// ── Helpers ─────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2);
}

function pageHintFromPath(path: string): "logs" | "metrics" | "traces" | undefined {
  if (path.startsWith("/logs")) return "logs";
  if (path.startsWith("/metrics")) return "metrics";
  if (path.startsWith("/traces")) return "traces";
  return undefined;
}

function assistantIntro(path: string): string {
  if (path === "/" || path.startsWith("/#")) return "I can see the Dashboard. Ask me about KPIs, error rates, latency spikes, or recent alerts.";
  if (path.startsWith("/metrics")) return "I'm on the Metrics Explorer. Ask me to pull up any metric series, compare services, or explain anomalies.";
  if (path.startsWith("/logs")) return "I'm on the Logs Explorer. Ask me to search for errors, filter by service, or find correlated log events.";
  if (path.startsWith("/traces")) return "I'm on the Traces view. Ask me to find slow traces, error spans, or investigate a specific service.";
  if (path.startsWith("/alerts")) return "I'm on the Alerts page. Ask me about firing rules, SLO burn rate, or how to configure an alert.";
  if (path.startsWith("/integrations")) return "I'm on the Integrations page. Ask me how to connect AWS, Kubernetes, Node.js, or any other data source.";
  return "I'm your Pulse AI assistant. Ask me anything about your services, metrics, logs, or traces.";
}

// ── Message bubble ───────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex items-start gap-2 text-[11px] text-zinc-500">
        <span className="mt-0.5 shrink-0 text-xs">✨</span>
        <span className="italic">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-xl text-sm"
          style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.25), rgba(56,189,248,0.15))", border: "1px solid rgba(6,214,199,0.3)" }}>
          ✨
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? "ml-auto" : ""}`}>
        <div
          className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
          style={isUser
            ? { background: "rgba(6,214,199,0.12)", border: "1px solid rgba(6,214,199,0.22)", color: "#e4e4e7" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#d4d4d8" }}
        >
          {msg.content}
        </div>
        {msg.action && (
          <a
            href={msg.action.href}
            className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all"
            style={{ background: "rgba(6,214,199,0.08)", border: "1px solid rgba(6,214,199,0.2)", color: "#06d6c7" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.15)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.08)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 6h8M6 2l4 4-4 4" />
            </svg>
            {msg.action.label}
          </a>
        )}
        <div className="mt-1 text-[10px] text-zinc-600">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ── Typing indicator ─────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-xl text-sm"
        style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.25), rgba(56,189,248,0.15))", border: "1px solid rgba(6,214,199,0.3)" }}>
        ✨
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-zinc-500"
            style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main AI Assistant panel ──────────────────────────────────────
export function AiAssistantPanel({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialise with context-aware intro
  useEffect(() => {
    setMessages([
      {
        id: uid(),
        role: "assistant",
        content: assistantIntro(pathname),
        timestamp: Date.now(),
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [pathname]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Escape key to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;

    setInput("");
    setBusy(true);

    // Add user message
    setMessages(prev => [...prev, { id: uid(), role: "user", content: q, timestamp: Date.now() }]);

    try {
      const pageHint = pageHintFromPath(pathname);
      const res = await planNlQueryAction(q, pageHint);

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant",
          content: `I couldn't process that: ${res.error}. Try rephrasing — for example "show error logs for checkout-api".`,
          timestamp: Date.now(),
        }]);
        return;
      }

      const { plan } = res;

      // Build a human-readable summary and a navigation action
      let summary = plan.reasoning || "Here's what I found.";
      let action: Message["action"] | undefined;
      const q2 = new URLSearchParams();

      if (plan.kind === "metrics" && plan.metrics) {
        const m = plan.metrics;
        q2.set("service", m.service);
        q2.set("metric", m.metricName);
        q2.set("range", m.rangeKey);
        action = { label: `Open ${m.metricName} in Metrics Explorer`, href: `/metrics?${q2}` };
        summary = `I'll pull up **${m.metricName}** for **${m.service}** over the last ${m.rangeKey}. ${plan.reasoning}`;
      } else if (plan.kind === "logs" && plan.logs) {
        const l = plan.logs;
        if (l.service) q2.set("service", l.service);
        if (l.level) q2.set("level", l.level);
        if (l.q) q2.set("q", l.q);
        action = { label: `Open log search`, href: `/logs?${q2}` };
        summary = `Searching ${l.level ? l.level.toUpperCase() + " " : ""}logs${l.service ? ` for **${l.service}**` : ""}. ${plan.reasoning}`;
      } else if (plan.kind === "traces" && plan.traces) {
        const t = plan.traces;
        if (t.service) q2.set("service", t.service);
        if (t.errorsOnly) q2.set("errorsOnly", "1");
        if (t.minDurationMs) q2.set("minDurationMs", String(t.minDurationMs));
        action = { label: "Open Traces Explorer", href: `/traces?${q2}` };
        summary = `Finding traces${t.service ? ` from **${t.service}**` : ""}${t.errorsOnly ? " with errors" : ""}${t.minDurationMs ? ` over ${t.minDurationMs}ms` : ""}. ${plan.reasoning}`;
      }

      // Clean up bold markdown to plain
      summary = summary.replace(/\*\*([^*]+)\*\*/g, "$1");

      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content: summary,
        action,
        timestamp: Date.now(),
      }]);

      // Auto-navigate if on a different page
      if (plan.kind !== pageHint && action) {
        router.push(action.href);
      }

    } catch {
      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content: "Something went wrong. Make sure your AI API key is configured in `.env.local` (OPENAI_API_KEY or equivalent).",
        timestamp: Date.now(),
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy, pathname, router]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function clearChat() {
    setMessages([{
      id: uid(), role: "assistant",
      content: assistantIntro(pathname),
      timestamp: Date.now(),
    }]);
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Pulse AI Assistant">
      {/* Backdrop */}
      <button type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
        onClick={onClose} aria-label="Close AI assistant" />

      {/* Panel */}
      <div
        className="relative ml-auto flex h-full w-full max-w-[440px] flex-col"
        style={{ background: "#04080f", borderLeft: "1px solid rgba(6,214,199,0.2)", boxShadow: "-32px 0 120px rgba(0,0,0,0.7)" }}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4"
          style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.1) 0%, rgba(56,189,248,0.04) 100%)", borderBottom: "1px solid rgba(6,214,199,0.12)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl text-base"
                style={{ background: "linear-gradient(135deg, rgba(6,214,199,0.3), rgba(56,189,248,0.2))", border: "1px solid rgba(6,214,199,0.4)", boxShadow: "0 0 20px rgba(6,214,199,0.2)" }}>
                ✨
              </div>
              <div>
                <div className="text-sm font-bold text-white">Pulse AI</div>
                <div className="text-[10px] text-zinc-500">Context-aware observability assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={clearChat}
                className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-400"
                title="Clear conversation">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1l12 12M3.5 3.5a5 5 0 107.07 7.07" />
                </svg>
              </button>
              <button type="button" onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                title="Close (Esc)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
            {busy && <TypingDots />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Suggested prompts — only when no conversation yet */}
        {messages.length <= 1 && !busy && (
          <div className="shrink-0 border-t border-white/[0.05] px-5 py-3">
            <p className="mb-2.5 text-[10px] uppercase tracking-widest text-zinc-600">Suggested investigations</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.prompt}
                  type="button"
                  onClick={() => void send(s.prompt)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-zinc-400 transition-all"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.background = "rgba(6,214,199,0.06)";
                    el.style.border = "1px solid rgba(6,214,199,0.2)";
                    el.style.color = "#a1a1aa";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.background = "rgba(255,255,255,0.03)";
                    el.style.border = "1px solid rgba(255,255,255,0.06)";
                    el.style.color = "";
                  }}
                >
                  <span className="shrink-0">{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="relative rounded-2xl transition-all"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(6,214,199,0.2)", boxShadow: "0 0 0 0 rgba(6,214,199,0)" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your services, logs, traces…"
              rows={2}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              style={{ maxHeight: 120 }}
              disabled={busy}
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <span className="text-[10px] text-zinc-700">Enter to send · Shift+Enter for newline</span>
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim() || busy}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: "rgba(6,214,199,0.15)", color: "#06d6c7", border: "1px solid rgba(6,214,199,0.3)" }}
                onMouseEnter={e => { if (!busy && input.trim()) (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.15)"; }}
              >
                {busy ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 1v2M6 9v2M1 6h2M9 6h2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                    <path d="M2 10L10 6 2 2v3l5 1-5 1v3z" />
                  </svg>
                )}
                {busy ? "Thinking…" : "Ask"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
