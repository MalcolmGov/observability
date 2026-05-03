import { Suspense } from "react";
import { ServiceMapView } from "@/components/service-map-view";

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="pulse-page py-12 text-sm text-zinc-500">
          Loading service map…
        </div>
      }
    >
      <ServiceMapView />
    </Suspense>
  );
}
