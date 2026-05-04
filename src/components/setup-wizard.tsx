"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface SetupWizardProps {
  onClose: () => void;
}

export function SetupWizard({ onClose }: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SLO State
  const [sloService, setSloService] = useState("api-gateway");
  const [sloTarget, setSloTarget] = useState("99.9");

  // Alert State
  const [alertName, setAlertName] = useState("High API latency");
  const [alertType, setAlertType] = useState<"metric" | "log_count">("metric");

  const handleCreateSlo = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/slo/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: sloService,
          health_threshold: Number(sloTarget)
        }),
      });
      if (!res.ok) throw new Error("Failed to create SLO");
      setStep(3);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAlert = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: alertName,
          rule_type: alertType,
          service: sloService,
          metric_name: alertType === "metric" ? "http.server.request_duration_ms" : "",
          comparator: "gt",
          threshold: alertType === "metric" ? "500" : "50",
          window_minutes: 5,
          log_level: alertType === "log_count" ? "error" : null,
          enabled: true,
        }),
      });
      if (!res.ok) throw new Error("Failed to create Alert Rule");
      setStep(4);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative flex w-full max-w-2xl flex-col rounded-3xl border border-white/[0.1] bg-[#090d16] shadow-2xl overflow-hidden">
        
        {/* Header / Stepper Progress */}
        <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/[0.02] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">
              {step}
            </div>
            <span className="text-[13px] font-semibold text-zinc-300">
              {step === 1 ? "Welcome to Pulse" : step === 2 ? "Define an SLO" : step === 3 ? "Set up Alerting" : "All Set!"}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
        </div>

        {/* Content Area */}
        <div className="px-8 py-8 min-h-[300px]">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-400">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to your new Command Centre</h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Pulse gives you immediate visibility into your system's health. We automatically ingest your OpenTelemetry metrics, logs, and traces to provide a unified investigation experience. Let's get your first service monitored.
              </p>
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6 mb-6 text-center">
                <div className="text-4xl mb-4">🚀</div>
                <div className="text-sm font-medium text-zinc-300">Zero-config OTel receiver ready.</div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)} className="pulse-btn-primary px-6 py-2">
                  Configure a Service →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8">
              <h2 className="text-2xl font-bold text-white mb-2">Service Level Objective</h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Define the baseline reliability target for your service. Pulse uses this to track your error budget and trigger fast-burn alerts when you're bleeding reliability.
              </p>
              
              <div className="flex flex-col gap-4 mb-8">
                <label className="block text-xs font-medium text-zinc-300">
                  Service Name
                  <input 
                    type="text" 
                    value={sloService} 
                    onChange={e => setSloService(e.target.value)}
                    className="pulse-input mt-1.5 w-full bg-slate-900" 
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-300">
                  Target Reliability (%)
                  <input 
                    type="number" 
                    step="0.01"
                    value={sloTarget} 
                    onChange={e => setSloTarget(e.target.value)}
                    className="pulse-input mt-1.5 w-full bg-slate-900" 
                  />
                </label>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="pulse-btn-secondary px-6 py-2">Back</button>
                <button onClick={handleCreateSlo} disabled={busy} className="pulse-btn-primary px-6 py-2 disabled:opacity-50">
                  {busy ? "Saving…" : "Save SLO →"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-8">
              <h2 className="text-2xl font-bold text-white mb-2">Create an Alert Rule</h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                When things go wrong, how should we notify you? Let's set up a basic threshold rule for {sloService}.
              </p>
              
              <div className="flex flex-col gap-4 mb-8">
                <label className="block text-xs font-medium text-zinc-300">
                  Alert Name
                  <input 
                    type="text" 
                    value={alertName} 
                    onChange={e => setAlertName(e.target.value)}
                    className="pulse-input mt-1.5 w-full bg-slate-900" 
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-300">
                  Monitor Type
                  <select 
                    value={alertType}
                    onChange={e => setAlertType(e.target.value as "metric" | "log_count")}
                    className="pulse-select mt-1.5 w-full bg-slate-900"
                  >
                    <option value="metric">Metric (e.g. Latency &gt; 500ms)</option>
                    <option value="log_count">Log Pattern (e.g. &gt; 50 Errors)</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="pulse-btn-secondary px-6 py-2">Back</button>
                <button onClick={handleCreateAlert} disabled={busy} className="pulse-btn-primary px-6 py-2 disabled:opacity-50">
                  {busy ? "Creating…" : "Create Alert →"}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in zoom-in-95 text-center py-8">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-500/20 text-4xl mb-6">
                🎉
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">You're fully operational.</h2>
              <p className="text-sm text-zinc-400 mb-8 max-w-md mx-auto">
                Your first service is monitored and protected by active alert rules. We've set up the dashboard so you can watch telemetry flow in.
              </p>
              <button onClick={() => {
                onClose();
                router.push("/");
              }} className="pulse-btn-primary px-8 py-3 text-base shadow-[0_0_24px_rgba(6,214,199,0.3)]">
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
