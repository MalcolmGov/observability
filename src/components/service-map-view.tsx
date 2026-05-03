"use client";

import { useCallback, useEffect, useState } from "react";

type Edge = { source: string; target: string; weight: number };

export function ServiceMapView() {
  const [nodes, setNodes] = useState<string[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [since, setSince] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const sinceMs = Date.now() - 60 * 60 * 1000;
    const res = await fetch(`/api/v1/service-map?sinceMs=${sinceMs}`);
    if (!res.ok) {
      setError("Failed to load map");
      return;
    }
    const data = (await res.json()) as {
      since: number;
      nodes: string[];
      edges: Edge[];
    };
    setSince(data.since);
    setNodes(data.nodes);
    setEdges(data.edges);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Service map
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Inferred edges from client spans with{" "}
            <code className="text-zinc-500">peer_service</code> and from parent
            spans that cross service boundaries.
          </p>
          {since ? (
            <p className="mt-2 text-[11px] text-zinc-600">
              Window starts {new Date(since).toLocaleString()}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10"
        >
          Refresh
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 shadow-lg shadow-slate-950/25">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Nodes ({nodes.length})
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {nodes.length === 0 ? (
            <span className="text-sm text-zinc-500">
              No nodes yet. Load demo data or ingest traces.
            </span>
          ) : (
            nodes.map((n) => (
              <span
                key={n}
                className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-xs text-zinc-200"
              >
                {n}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 shadow-lg shadow-slate-950/25">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Edges
        </h2>
        <ul className="mt-4 flex flex-col gap-2">
          {edges.length === 0 ? (
            <li className="text-sm text-zinc-500">No edges in window.</li>
          ) : (
            edges.map((e) => (
              <li
                key={`${e.source}->${e.target}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-indigo-200">{e.source}</span>
                <span className="text-zinc-600">→</span>
                <span className="font-medium text-emerald-200">{e.target}</span>
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-zinc-400">
                  {e.weight} spans
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
