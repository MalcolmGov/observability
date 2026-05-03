import { AppCatalogGrid } from "@/components/app-catalog-grid";

export default function CatalogPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="max-w-3xl border-b border-white/10 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          App catalog
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Product × market matrix from the service catalog, colored by the worst
          APM signals in each slice (root-span error rate and p95). Click any
          cell to open Services with matching filters—no extra endpoints, same
          telemetry you already ingest.
        </p>
      </header>

      <AppCatalogGrid />
    </div>
  );
}
