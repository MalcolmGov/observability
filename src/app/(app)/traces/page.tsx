import { Suspense } from "react";
import { TracesExplorer } from "@/components/traces-explorer";

export default function TracesPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-sm text-zinc-500">Loading traces…</div>
      }
    >
      <TracesExplorer />
    </Suspense>
  );
}
