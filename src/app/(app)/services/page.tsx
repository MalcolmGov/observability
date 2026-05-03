import { Suspense } from "react";
import { ServicesView } from "@/components/services-view";

export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-zinc-500">
          Loading services…
        </div>
      }
    >
      <ServicesView />
    </Suspense>
  );
}
