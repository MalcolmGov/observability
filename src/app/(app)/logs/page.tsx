import { Suspense } from "react";
import { LogsExplorer } from "@/components/logs-explorer";

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-sm text-zinc-500">Loading logs…</div>
      }
    >
      <LogsExplorer />
    </Suspense>
  );
}
