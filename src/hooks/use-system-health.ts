"use client";

import { useEffect, useState } from "react";

type SvcHealth = "healthy" | "degraded" | "critical";

export interface SystemHealth {
  status: "loading" | "ok" | "degraded" | "critical" | "error";
  services: number;
  healthy: number;
  degraded: number;
  critical: number;
}

export function useSystemHealth(pollMs = 30_000): SystemHealth {
  const [health, setHealth] = useState<SystemHealth>({
    status: "loading",
    services: 0,
    healthy: 0,
    degraded: 0,
    critical: 0,
  });

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/v1/overview?windowMs=3600000", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as {
          services: { health: SvcHealth }[];
        };
        const svcs = data.services ?? [];
        const healthy = svcs.filter((s) => s.health === "healthy").length;
        const degraded = svcs.filter((s) => s.health === "degraded").length;
        const critical = svcs.filter((s) => s.health === "critical").length;
        setHealth({
          status: critical > 0 ? "critical" : degraded > 0 ? "degraded" : "ok",
          services: svcs.length,
          healthy,
          degraded,
          critical,
        });
      } catch {
        setHealth((h) => ({ ...h, status: "error" }));
      }
    }
    void poll();
    const id = setInterval(() => void poll(), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return health;
}
