import "server-only";

import { queryAll } from "@/db/client";

export type NlQueryContext = {
  tenantId: string;
  services: string[];
  /** Distinct metric names (capped) for model hints. */
  metricNames: string[];
};

export async function loadNlQueryContext(
  tenantId: string,
): Promise<NlQueryContext> {
  const svcRows = await queryAll<{ service: string }>(
    `
    SELECT DISTINCT service FROM metric_points WHERE tenant_id = ?
    UNION
    SELECT DISTINCT service FROM log_entries WHERE tenant_id = ?
    UNION
    SELECT DISTINCT service FROM trace_spans WHERE tenant_id = ?
    ORDER BY service ASC
  `,
    [tenantId, tenantId, tenantId],
  );
  const services = svcRows.map((r) => r.service).filter(Boolean);

  const nameRows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    WHERE tenant_id = ?
    ORDER BY name ASC
    LIMIT 120
  `,
    [tenantId],
  );
  const metricNames = nameRows.map((r) => r.name).filter(Boolean);

  return { tenantId, services, metricNames };
}

export async function metricNamesForService(
  service: string,
  tenantId: string,
): Promise<string[]> {
  const rows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    WHERE tenant_id = ? AND service = ?
    ORDER BY name ASC
  `,
    [tenantId, service],
  );
  return rows.map((r) => r.name).filter(Boolean);
}
