import { Suspense } from "react";
import { MetricsExplorer } from "@/components/metrics-explorer";

export default function MetricsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-sm text-zinc-500">Loading metrics…</div>
      }
    >
      <MetricsExplorer />
    </Suspense>
  );
}
