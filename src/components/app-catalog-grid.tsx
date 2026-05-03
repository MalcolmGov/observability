"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KNOWN_MARKETS_ORDER } from "@/lib/market-scope";

const GRID_PRODUCTS = ["consumer", "merchant", "agent"] as const;

const WINDOW_MS = 60 * 60 * 1000;

type ApmServiceRow = {
  service: string;
  traces: number;
  requests: number;
  errorRate: number;
  p95Ms: number | null;
};

type CatalogRow = {
  serviceName: string;
  product: string;
  marketsActive: string[];
};

type CellHealth = "loading" | "empty" | "ok" | "warn" | "critical";

type CatalogCell = {
  health: CellHealth;
  catalogServiceCount: number;
  apmServiceCount: number;
  worstErrorRate: number | null;
  worstP95Ms: number | null;
};

function cellKey(product: string, market: string): string {
  return `${product}:${market}`;
}

function catalogCoversCell(row: CatalogRow, product: string, market: string): boolean {
  if (row.product !== product) return false;
  const mUp = market.toUpperCase();
  return row.marketsActive.some((x) => String(x).trim().toUpperCase() === mUp);
}

/** Worst traffic-weighted signal across services in the slice (Option A heuristic). */
function healthFromApm(services: ApmServiceRow[]): Omit<CatalogCell, "catalogServiceCount"> {
  const active = services.filter((s) => s.requests > 0 || s.traces > 0);
  if (!active.length) {
    return {
      health: "empty",
      apmServiceCount: services.length,
      worstErrorRate: null,
      worstP95Ms: null,
    };
  }

  let worstErr = 0;
  let worstP95: number | null = null;
  for (const s of active) {
    worstErr = Math.max(worstErr, s.errorRate);
    const p95 = s.p95Ms;
    if (p95 != null && Number.isFinite(p95)) {
      worstP95 = worstP95 == null ? p95 : Math.max(worstP95, p95);
    }
  }

  let health: Exclude<CellHealth, "loading"> = "ok";
  if (worstErr >= 0.05 || (worstP95 != null && worstP95 >= 4000)) health = "critical";
  else if (worstErr >= 0.01 || (worstP95 != null && worstP95 >= 1500))
    health = "warn";

  return {
    health,
    apmServiceCount: services.length,
    worstErrorRate: worstErr,
    worstP95Ms: worstP95,
  };
}

function cellSurfaceClass(health: CellHealth): string {
  switch (health) {
    case "loading":
      return "animate-pulse bg-zinc-800/40 ring-1 ring-white/[0.06]";
    case "empty":
      return "bg-zinc-900/50 ring-1 ring-white/[0.06] text-zinc-600";
    case "ok":
      return "bg-emerald-500/10 ring-1 ring-emerald-500/25 text-emerald-100/90 hover:bg-emerald-500/15";
    case "warn":
      return "bg-amber-500/12 ring-1 ring-amber-400/30 text-amber-50 hover:bg-amber-500/18";
    case "critical":
      return "bg-rose-500/14 ring-1 ring-rose-400/35 text-rose-50 hover:bg-rose-500/20";
    default:
      return "";
  }
}

function productLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function AppCatalogGrid() {
  const markets = KNOWN_MARKETS_ORDER;

  const [catalog, setCatalog] = useState<CatalogRow[] | null>(null);
  const [cells, setCells] = useState<Record<string, CatalogCell>>({});
  const [error, setError] = useState<string | null>(null);

  const catalogCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!catalog) return counts;
    for (const product of GRID_PRODUCTS) {
      for (const market of markets) {
        const key = cellKey(product, market);
        counts[key] = catalog.filter((r) =>
          catalogCoversCell(r, product, market),
        ).length;
      }
    }
    return counts;
  }, [catalog, markets]);

  const seedLoadingCells = useCallback(() => {
    const next: Record<string, CatalogCell> = {};
    for (const product of GRID_PRODUCTS) {
      for (const market of markets) {
        const key = cellKey(product, market);
        next[key] = {
          health: "loading",
          catalogServiceCount: catalogCounts[key] ?? 0,
          apmServiceCount: 0,
          worstErrorRate: null,
          worstP95Ms: null,
        };
      }
    }
    setCells(next);
  }, [catalogCounts, markets]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function run() {
      try {
        const catRes = await fetch("/api/v1/catalog/services");
        if (!catRes.ok) throw new Error("Catalog request failed");
        const catJson = (await catRes.json()) as { services: CatalogRow[] };
        if (cancelled) return;
        setCatalog(catJson.services ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load catalog");
          setCatalog([]);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (catalog === null) return;

    let cancelled = false;
    seedLoadingCells();

    async function loadRow(product: (typeof GRID_PRODUCTS)[number]) {
      const results = await Promise.all(
        markets.map(async (market) => {
          const key = cellKey(product, market);
          const count = catalogCounts[key] ?? 0;
          try {
            const res = await fetch(
              `/api/v1/apm/services?windowMs=${WINDOW_MS}&product=${encodeURIComponent(product)}&market=${encodeURIComponent(market)}`,
            );
            if (!res.ok) throw new Error("APM failed");
            const json = (await res.json()) as { services: ApmServiceRow[] };
            const merged = { ...healthFromApm(json.services ?? []), catalogServiceCount: count };
            return { key, merged };
          } catch {
            return {
              key,
              merged: {
                health: "empty" as const,
                catalogServiceCount: count,
                apmServiceCount: 0,
                worstErrorRate: null,
                worstP95Ms: null,
              },
            };
          }
        }),
      );

      if (cancelled) return;
      setCells((prev) => {
        const next = { ...prev };
        for (const { key, merged } of results) {
          next[key] = merged;
        }
        return next;
      });
    }

    async function allRows() {
      for (const product of GRID_PRODUCTS) {
        if (cancelled) return;
        await loadRow(product);
      }
    }

    void allRows();

    return () => {
      cancelled = true;
    };
  }, [catalog, catalogCounts, markets, seedLoadingCells]);

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-slate-950/40 shadow-inner shadow-black/20">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Application catalog health by product row and market column
          </caption>
          <thead>
            <tr className="border-b border-white/[0.08] bg-slate-950/80">
              <th
                scope="col"
                className="sticky left-0 z-[1] bg-slate-950/95 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500"
              >
                Product \ Market
              </th>
              {markets.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-2 py-2.5 text-center text-xs font-semibold tracking-wide text-zinc-300"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRID_PRODUCTS.map((product) => (
              <tr
                key={product}
                className="border-b border-white/[0.05] last:border-b-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-slate-950/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400"
                >
                  {productLabel(product)}
                </th>
                {markets.map((market) => {
                  const key = cellKey(product, market);
                  const cell = cells[key];
                  const href = `/services?product=${encodeURIComponent(product)}&market=${encodeURIComponent(market)}`;
                  const health = cell?.health ?? "loading";
                  const surface = cellSurfaceClass(health);
                  const titleParts = [
                    `${productLabel(product)} × ${market}`,
                    cell
                      ? `${cell.catalogServiceCount} catalog service(s)`
                      : null,
                    cell && cell.apmServiceCount > 0
                      ? `${cell.apmServiceCount} with APM slice`
                      : null,
                    cell?.worstErrorRate != null
                      ? `max error ${(cell.worstErrorRate * 100).toFixed(2)}%`
                      : null,
                    cell?.worstP95Ms != null
                      ? `max p95 ${Math.round(cell.worstP95Ms)}ms`
                      : null,
                  ].filter(Boolean);

                  return (
                    <td key={market} className="p-1 align-middle">
                      <Link
                        href={href}
                        className={`flex min-h-[3.25rem] flex-col justify-center rounded-lg px-2 py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${surface}`}
                        title={titleParts.join(" · ")}
                        aria-label={`Open services for ${product} in ${market}`}
                      >
                        {health === "loading" ? (
                          <span className="mx-auto h-2 w-10 rounded-full bg-zinc-700/80" />
                        ) : (
                          <>
                            <span className="text-[11px] font-semibold tabular-nums">
                              {cell!.catalogServiceCount > 0
                                ? cell!.catalogServiceCount
                                : "—"}
                            </span>
                            <span className="text-[10px] leading-tight text-zinc-500">
                              {cell!.apmServiceCount > 0 &&
                              cell!.worstErrorRate != null
                                ? `${(cell!.worstErrorRate * 100).toFixed(1)}% err`
                                : cell!.apmServiceCount === 0
                                  ? "no traffic"
                                  : "—"}
                            </span>
                          </>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-zinc-500">
        <span className="font-medium text-zinc-400">Legend</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500/35 ring ring-emerald-500/30" />{" "}
          Healthy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-500/35 ring ring-amber-400/30" />{" "}
          Elevated latency or errors
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-rose-500/35 ring ring-rose-400/35" />{" "}
          Critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-zinc-800 ring ring-white/10" />{" "}
          No traffic in window
        </span>
        <span className="text-zinc-600">
          Window {WINDOW_MS / 3_600_000}h · Click a cell for scoped Services
        </span>
      </div>
    </div>
  );
}
