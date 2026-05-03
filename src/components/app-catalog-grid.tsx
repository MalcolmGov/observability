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
  // Active cells use semantic chip tokens + lift on hover.
  // Empty cells recede strongly so active cells pop.
  switch (health) {
    case "loading":
      return "pulse-skeleton ring-1 ring-white/[0.04] text-transparent";
    case "empty":
      return "bg-white/[0.012] ring-1 ring-white/[0.04] text-zinc-600 opacity-70 hover:opacity-100 hover:bg-white/[0.02]";
    case "ok":
      return "pulse-cell-ok";
    case "warn":
      return "pulse-cell-warn";
    case "critical":
      return "pulse-cell-critical";
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

      <div className="pulse-fade-in overflow-x-auto rounded-2xl border border-[var(--pulse-border-default)] bg-slate-950/40 shadow-inner shadow-black/20">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Application catalog health by product row and market column
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="pulse-eyebrow sticky left-0 z-[1] bg-slate-950/95 px-4 py-3"
              >
                Product
              </th>
              {markets.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-2 py-3 text-center text-[11px] font-semibold tracking-wide text-zinc-300"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRID_PRODUCTS.map((product, idx) => (
              <tr
                key={product}
                className="border-t border-[var(--pulse-border-light)]"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <th
                  scope="row"
                  className="pulse-title sticky left-0 z-[1] bg-slate-950/92 px-4 py-3 text-zinc-100"
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

                  const dotClass =
                    health === "ok"
                      ? "pulse-status-dot-success"
                      : health === "warn"
                        ? "pulse-status-dot-warning"
                        : health === "critical"
                          ? "pulse-status-dot-danger"
                          : health === "empty"
                            ? "pulse-status-dot-neutral opacity-30"
                            : "";

                  return (
                    <td key={market} className="p-1 align-middle">
                      <Link
                        href={href}
                        className={`pulse-transition relative flex min-h-[3.5rem] w-full flex-col items-center justify-center rounded-lg px-2 py-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${surface}`}
                        title={titleParts.join(" · ")}
                        aria-label={`Open services for ${product} in ${market}`}
                      >
                        {health === "loading" ? (
                          <span className="mx-auto h-2 w-10 rounded-full bg-white/10" />
                        ) : health === "empty" ? (
                          <>
                            <span
                              className={`pulse-status-dot ${dotClass} mb-1`}
                              aria-hidden
                            />
                            <span className="text-[10px] uppercase tracking-wide text-zinc-600">
                              no traffic
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="absolute left-1.5 top-1.5">
                              <span
                                className={`pulse-status-dot ${dotClass}`}
                                aria-hidden
                              />
                            </span>
                            <span className="pulse-mono-num text-base font-semibold leading-none">
                              {cell!.apmServiceCount > 0 &&
                              cell!.worstErrorRate != null
                                ? `${(cell!.worstErrorRate * 100).toFixed(1)}%`
                                : "0%"}
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-current opacity-75">
                              <span className="pulse-mono-num">
                                {cell!.apmServiceCount}{" "}
                                {cell!.apmServiceCount === 1 ? "svc" : "svcs"}
                              </span>
                              {cell!.worstP95Ms != null ? (
                                <span className="opacity-60">·</span>
                              ) : null}
                              {cell!.worstP95Ms != null ? (
                                <span className="pulse-mono-num">
                                  {Math.round(cell!.worstP95Ms)}ms
                                </span>
                              ) : null}
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-1">
        <span className="pulse-eyebrow">Legend</span>
        <span className="pulse-chip pulse-chip-success">
          <span className="pulse-status-dot pulse-status-dot-success" /> Healthy
        </span>
        <span className="pulse-chip pulse-chip-warning">
          <span className="pulse-status-dot pulse-status-dot-warning" /> Elevated
        </span>
        <span className="pulse-chip pulse-chip-danger">
          <span className="pulse-status-dot pulse-status-dot-danger" /> Critical
        </span>
        <span className="pulse-chip pulse-chip-neutral">
          <span className="pulse-status-dot pulse-status-dot-neutral" /> No
          traffic
        </span>
        <span className="ml-auto text-[11px] text-zinc-600">
          Window {WINDOW_MS / 3_600_000}h · Click a cell for scoped Services
        </span>
      </div>
    </div>
  );
}
