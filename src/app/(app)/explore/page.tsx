import { Suspense } from "react";
import { ExploreView } from "@/components/explore-view";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-10 text-sm text-zinc-500">Loading explore…</div>
      }
    >
      <ExploreView />
    </Suspense>
  );
}
