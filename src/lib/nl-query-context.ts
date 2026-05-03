import "server-only";

import { queryAll } from "@/db/client";

export type NlQueryContext = {
  services: string[];
  /** Distinct metric names (capped) for model hints. */
  metricNames: string[];
};

export async function loadNlQueryContext(): Promise<NlQueryContext> {
  const svcRows = await queryAll<{ service: string }>(
    `
    SELECT DISTINCT service FROM metric_points
    UNION
    SELECT DISTINCT service FROM log_entries
    UNION
    SELECT DISTINCT service FROM trace_spans
    ORDER BY service ASC
  `,
    [],
  );
  const services = svcRows.map((r) => r.service).filter(Boolean);

  const nameRows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    ORDER BY name ASC
    LIMIT 120
  `,
    [],
  );
  const metricNames = nameRows.map((r) => r.name).filter(Boolean);

  return { services, metricNames };
}

export async function metricNamesForService(
  service: string,
): Promise<string[]> {
  const rows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    WHERE service = ?
    ORDER BY name ASC
  `,
    [service],
  );
  return rows.map((r) => r.name).filter(Boolean);
}
