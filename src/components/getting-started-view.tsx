"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/* ─── Injected styles ────────────────────────────────────────── */
const CSS = `
@keyframes aurora-spin {
  from { transform: rotate(0deg) scale(1.1); }
  to   { transform: rotate(360deg) scale(1.1); }
}
@keyframes float-y {
  0%,100% { transform: translateY(0px); }
  50%     { transform: translateY(-14px); }
}
@keyframes packet {
  0%   { opacity:0; left:0; }
  8%   { opacity:1; }
  90%  { opacity:1; }
  100% { opacity:0; left:calc(100% - 8px); }
}
.gs-aurora {
  position:absolute; border-radius:50%;
  animation: aurora-spin 18s linear infinite;
  filter: blur(60px); pointer-events:none;
}
.gs-float { animation: float-y 6s ease-in-out infinite; }
.gs-packet {
  position:absolute; top:50%; width:8px; height:8px;
  border-radius:50%; transform:translateY(-50%);
  animation: packet 2.6s ease-in-out infinite;
}
.gs-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  transition: all 0.25s ease;
}
.gs-card:hover {
  background: rgba(255,255,255,0.055);
  border-color: rgba(255,255,255,0.14);
  transform: translateY(-2px);
}
`;

/* ─── Animated pipeline ──────────────────────────────────────── */
const NODES = [
  { icon: "💻", label: "Your App", sub: "OTel SDK", c: "#a78bfa", delay: 0 },
  { icon: "🔄", label: "Collector", sub: "Route & Transform", c: "#38bdf8", delay: 0.3 },
  { icon: "⚡", label: "Pulse", sub: "Ingest & Store", c: "#06d6c7", delay: 0.6 },
  { icon: "📊", label: "Dashboards", sub: "Explore & Alert", c: "#34d399", delay: 0.9 },
];

function Pipeline() {
  return (
    <div className="relative overflow-hidden rounded-[28px] p-8 sm:p-10"
      style={{ background: "rgba(4,8,20,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="mb-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">OpenTelemetry Native</p>
        <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">How data flows into Pulse</h3>
        <p className="mt-1 text-[13px] text-zinc-500">Instrument once — all signals flow through automatically</p>
      </div>
      <div className="flex items-center justify-center gap-0 overflow-x-auto pb-2">
        {NODES.map((n, i) => (
          <div key={n.label} className="flex items-center">
            {/* Node */}
            <div className="flex flex-col items-center gap-2.5 gs-float" style={{ animationDelay: `${i * 0.4}s` }}>
              <div className="flex size-14 sm:size-16 items-center justify-center rounded-2xl text-2xl sm:text-3xl"
                style={{ background: `${n.c}18`, border: `1.5px solid ${n.c}44`, boxShadow: `0 0 24px 0 ${n.c}22` }}>
                {n.icon}
              </div>
              <div className="text-center">
                <div className="text-[12px] font-bold text-white sm:text-[13px]">{n.label}</div>
                <div className="text-[10px] text-zinc-600">{n.sub}</div>
              </div>
            </div>
            {/* Connector */}
            {i < NODES.length - 1 && (
              <div className="relative mx-3 flex-1" style={{ minWidth: 48, maxWidth: 120, height: 2, background: `linear-gradient(90deg, ${n.c}44, ${NODES[i+1].c}44)` }}>
                {[0,1,2].map(p => (
                  <span key={p} className="gs-packet"
                    style={{ background: NODES[i+1].c, boxShadow: `0 0 8px 2px ${NODES[i+1].c}88`, animationDelay: `${n.delay + p * 0.85}s` }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {["Metrics","Logs","Traces","Alerts","Incidents","AI-powered RCA"].map((s, i) => {
          const colors = ["#06d6c7","#38bdf8","#a78bfa","#f87171","#fbbf24","#34d399"];
          return (
            <span key={s} className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background:`${colors[i]}15`, color: colors[i], border:`1px solid ${colors[i]}33` }}>
              {s}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Checklist ──────────────────────────────────────────────── */
type Status = "checking" | "done" | "pending";
interface Step { id: string; num: number; label: string; desc: string; status: Status; href?: string; cta?: string; }

function StepCard({ s }: { s: Step }) {
  const done = s.status === "done";
  const checking = s.status === "checking";
  return (
    <div className="gs-card flex items-start gap-5 px-6 py-5"
      style={done ? { borderColor: "rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.04)" } : {}}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
        style={{ background: done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)", border: `1.5px solid ${done ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`, color: done ? "#34d399" : "#52525b" }}>
        {checking ? <span className="animate-spin text-xs">⏳</span> : done ? "✓" : s.num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[14px] font-semibold ${done ? "text-emerald-300" : "text-zinc-100"}`}>{s.label}</span>
          {done && <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background:"rgba(52,211,153,0.15)", color:"#34d399" }}>Done</span>}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{s.desc}</p>
      </div>
      {!done && s.href && (
        <Link href={s.href} className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition"
          style={{ background:"rgba(6,214,199,0.1)", color:"#06d6c7", border:"1px solid rgba(6,214,199,0.28)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.1)"; }}>
          {s.cta ?? "→"}
        </Link>
      )}
    </div>
  );
}

/* ─── Feature grid ───────────────────────────────────────────── */
const FEATURES = [
  { icon:"📊", title:"Metrics Explorer", desc:"PromQL-style queries, period-over-period comparison, stat bars and sparklines.", href:"/metrics", c:"#06d6c7" },
  { icon:"📝", title:"Log Search", desc:"Full-text search, level filters, live tail, and 48-bucket heatmap volume bars.", href:"/logs", c:"#38bdf8" },
  { icon:"🔀", title:"Distributed Traces", desc:"End-to-end waterfall with critical path, service colour coding and span timing.", href:"/traces", c:"#a78bfa" },
  { icon:"🚨", title:"Alert Rules", desc:"Threshold rules on rolling averages, auto-dispatch to Slack & PagerDuty.", href:"/alerts", c:"#f87171" },
  { icon:"🚒", title:"Incident Command", desc:"Real-time war room — incident queue, sparkline trend, error logs, triage actions.", href:"/incidents", c:"#fbbf24" },
  { icon:"🤖", title:"AI Assistant", desc:"Ask in plain English. The AI queries your real data and deep-links to explorers.", href:"/", c:"#34d399" },
];

/* ─── Main ───────────────────────────────────────────────────── */
export function GettingStartedView() {
  const [steps, setSteps] = useState<Step[]>([
    { id:"running", num:1, label:"Pulse is running", desc:"Server is healthy and accepting connections.", status:"checking" },
    { id:"connected", num:2, label:"Connect a data source", desc:"Send telemetry via OTel Collector, SDK, or load the demo below.", status:"checking", href:"/integrations", cta:"Browse Integrations →" },
    { id:"flowing", num:3, label:"Verify data is flowing", desc:"Metrics, logs or traces received in the last hour.", status:"checking", href:"/", cta:"Open Dashboard →" },
    { id:"alert", num:4, label:"Create your first alert rule", desc:"Set a threshold — e.g. p95 latency > 500ms — and it auto-dispatches.", status:"checking", href:"/alerts", cta:"Go to Alerts →" },
    { id:"notify", num:5, label:"Configure a notification channel", desc:"Route firing alerts to Slack, PagerDuty or a custom webhook.", status:"checking", href:"/alerts", cta:"Set up channel →" },
  ]);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const [ov, ru] = await Promise.all([
        fetch("/api/v1/overview?windowMs=3600000").then(r => r.ok ? r.json() : null),
        fetch("/api/v1/alerts/rules").then(r => r.ok ? r.json() : null),
      ]) as [{ totals?: { services?: number; metricPoints1h?: number; logLines1h?: number } } | null,
              { rules?: Array<{ slackWebhookUrl?: string | null; pagerdutyRoutingKey?: string | null; webhookUrl?: string | null }> } | null];
      const hasSvc  = (ov?.totals?.services ?? 0) > 0;
      const hasData = (ov?.totals?.metricPoints1h ?? 0) > 0 || (ov?.totals?.logLines1h ?? 0) > 0;
      const hasRule = (ru?.rules?.length ?? 0) > 0;
      const hasNote = ru?.rules?.some(r => r.slackWebhookUrl || r.pagerdutyRoutingKey || r.webhookUrl) ?? false;
      setSteps(p => p.map(s => ({
        ...s,
        status: s.id === "running" ? "done"
          : s.id === "connected" ? (hasSvc ? "done" : "pending")
          : s.id === "flowing"   ? (hasData ? "done" : "pending")
          : s.id === "alert"     ? (hasRule ? "done" : "pending")
          : s.id === "notify"    ? (hasNote ? "done" : "pending")
          : "pending",
      })));
    } catch {
      setSteps(p => p.map(s => ({ ...s, status: s.id === "running" ? "done" : "pending" })));
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  async function seed() {
    setSeeding(true); setSeedMsg(null);
    try {
      await fetch("/api/v1/demo/seed", { method:"POST" });
      await fetch("/api/v1/demo/incidents", { method:"POST" });
      await fetch("/api/v1/alerts/evaluate");
      setSeedMsg("✅ Demo loaded — all signals are live");
      await check();
    } catch { setSeedMsg("❌ Seed failed — ensure server is running"); }
    finally { setSeeding(false); }
  }

  const done = steps.filter(s => s.status === "done").length;
  const pct  = Math.round((done / steps.length) * 100);
  const allDone = done === steps.length;

  return (
    <div style={{ minHeight: "100vh", background: "#050810" }}>
      <style>{CSS}</style>

      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-24 text-center sm:py-32">
        {/* Aurora orbs */}
        <div className="gs-aurora" style={{ width:600, height:600, top:"-20%", left:"10%", background:"rgba(6,214,199,0.12)" }} />
        <div className="gs-aurora" style={{ width:500, height:500, bottom:"-10%", right:"5%", background:"rgba(167,139,250,0.1)", animationDirection:"reverse", animationDuration:"24s" }} />
        <div className="gs-aurora" style={{ width:300, height:300, top:"30%", right:"20%", background:"rgba(56,189,248,0.08)", animationDuration:"14s" }} />
        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage:"linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize:"48px 48px", maskImage:"radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)" }} />

        <div className="relative z-10 max-w-3xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold"
            style={{ borderColor:"rgba(6,214,199,0.3)", background:"rgba(6,214,199,0.08)", color:"#06d6c7" }}>
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-teal-400" />
            </span>
            OTel-native · AI-powered · Zero-config onboarding
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl"
            style={{ letterSpacing:"-0.04em", lineHeight:1.05 }}>
            <span style={{ background:"linear-gradient(135deg, #ffffff 0%, #a1f0eb 40%, #38bdf8 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              Observe everything.
            </span>
            <br />
            <span className="text-zinc-500">Act immediately.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Pulse ingests metrics, logs and traces from any OpenTelemetry source.
            Detect anomalies, investigate incidents in seconds, and get AI-powered
            root cause analysis — all in one platform.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => void seed()} disabled={seeding}
              className="inline-flex items-center gap-2.5 rounded-2xl px-6 py-3 text-sm font-bold transition-all disabled:opacity-60"
              style={{ background:"linear-gradient(135deg, rgba(6,214,199,0.2), rgba(56,189,248,0.15))", color:"#a1f0eb", border:"1px solid rgba(6,214,199,0.4)", boxShadow:"0 0 24px rgba(6,214,199,0.15)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 32px rgba(6,214,199,0.3)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px rgba(6,214,199,0.15)"; }}>
              {seeding ? <><span className="animate-spin">⏳</span> Loading…</> : <>🚀 Load Demo Data</>}
            </button>
            <Link href="/integrations"
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
              style={{ background:"rgba(255,255,255,0.05)", color:"#e4e4e7", border:"1px solid rgba(255,255,255,0.12)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}>
              Connect a source →
            </Link>
          </div>
          {seedMsg && <p className="mt-4 text-[12px]" style={{ color: seedMsg.startsWith("✅") ? "#34d399" : "#f87171" }}>{seedMsg}</p>}

          {/* Mini stat row */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] text-zinc-600">
            {["Metrics · Logs · Traces","Slack + PagerDuty","AI Root Cause Analysis","80+ Integrations"].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <span style={{ color:"#06d6c7" }}>✓</span> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CHECKLIST ════════════════════════════════════════════ */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Setup Checklist</h2>
            <p className="mt-1 text-[13px] text-zinc-500">{done} of {steps.length} steps complete</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-right text-sm font-bold" style={{ color:"#06d6c7" }}>{pct}%</div>
            <div className="h-2 w-36 overflow-hidden rounded-full" style={{ background:"rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width:`${pct}%`, background:"linear-gradient(90deg, #06d6c7, #38bdf8)" }} />
            </div>
          </div>
        </div>

        {allDone ? (
          <div className="gs-card flex items-center gap-4 px-6 py-5"
            style={{ borderColor:"rgba(52,211,153,0.3)", background:"rgba(52,211,153,0.06)" }}>
            <span className="text-3xl">🎉</span>
            <div>
              <div className="font-bold text-emerald-300">You're all set!</div>
              <p className="text-[12px] text-zinc-500">All setup steps complete. Head to the <Link href="/" className="underline" style={{ color:"#06d6c7" }}>Dashboard</Link> or <Link href="/incidents" className="underline" style={{ color:"#06d6c7" }}>Incident Command</Link>.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {steps.map(s => <StepCard key={s.id} s={s} />)}
          </div>
        )}

        <button type="button" onClick={() => void check()}
          className="mt-3 text-[11px] text-zinc-700 transition hover:text-zinc-400">↻ Re-check status</button>
      </section>

      {/* ══ PIPELINE ═════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <Pipeline />
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Platform Capabilities</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Everything in one place.</h2>
          <p className="mt-3 text-[14px] text-zinc-500">Six integrated observability tools — no tab-switching between systems.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <Link key={f.title} href={f.href}
              className="gs-card group flex flex-col gap-4 p-6"
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = `${f.c}44`;
                el.style.background = `${f.c}0a`;
                el.style.transform = "translateY(-4px)";
                el.style.boxShadow = `0 12px 32px ${f.c}1a`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(255,255,255,0.08)";
                el.style.background = "rgba(255,255,255,0.03)";
                el.style.transform = "";
                el.style.boxShadow = "";
              }}>
              <div className="flex size-12 items-center justify-center rounded-2xl text-2xl"
                style={{ background:`${f.c}18`, border:`1px solid ${f.c}33` }}>
                {f.icon}
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-bold text-white">{f.title}</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{f.desc}</p>
              </div>
              <div className="text-[12px] font-semibold transition-all" style={{ color: f.c }}>
                Open {f.title} →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ BOTTOM CTA ══════════════════════════════════════════ */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-[28px] px-8 py-12 text-center"
          style={{ background:"linear-gradient(135deg, rgba(6,214,199,0.08) 0%, rgba(56,189,248,0.06) 50%, rgba(167,139,250,0.07) 100%)", border:"1px solid rgba(6,214,199,0.18)" }}>
          <div className="pointer-events-none absolute -top-16 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-20"
            style={{ background:"radial-gradient(circle, #06d6c7, transparent 70%)" }} />
          <h3 className="relative text-2xl font-bold text-white sm:text-3xl">Ready to investigate your first incident?</h3>
          <p className="relative mt-3 text-[13px] text-zinc-400">Load demo data and explore the Incident Command Centre.</p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/incidents"
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition-all"
              style={{ background:"rgba(6,214,199,0.15)", color:"#06d6c7", border:"1px solid rgba(6,214,199,0.35)", boxShadow:"0 0 20px rgba(6,214,199,0.1)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 32px rgba(6,214,199,0.25)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(6,214,199,0.1)"; }}>
              🚒 Open Incident Command
            </Link>
            <Link href="/integrations"
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
              style={{ background:"rgba(255,255,255,0.05)", color:"#e4e4e7", border:"1px solid rgba(255,255,255,0.1)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}>
              Browse 80+ Integrations
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
