import { queryAll, queryGet, queryRun } from "@/db/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const putSchema = z.object({
  service: z.string().min(1).max(128),
  targetSuccess: z.number().min(0.9).max(0.99999),
  product: z.string().min(1).max(64).optional(),
  market: z.string().min(1).max(64).optional(),
  environment: z.string().min(1).max(64).optional(),
});

type SloRow = {
  service: string;
  product: string;
  market: string;
  environment: string;
  targetSuccess: number;
  updatedAt: number;
};

function mapSlo(r: SloRow) {
  return {
    service: r.service,
    product: r.product,
    market: r.market,
    environment: r.environment,
    targetSuccess: r.targetSuccess,
    updatedAtMs: r.updatedAt,
  };
}

/** List persisted SLO availability targets (composite: service × product × market × environment). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service")?.trim();
  const product = searchParams.get("product")?.trim();
  const market = searchParams.get("market")?.trim();
  const environment = searchParams.get("environment")?.trim();

  if (service && product && market && environment) {
    const row = await queryGet<SloRow>(
      `SELECT service, product, market, environment,
              target_success AS targetSuccess, updated_at AS updatedAt
         FROM slo_targets
        WHERE service = ? AND product = ? AND market = ? AND environment = ?`,
      [service, product, market, environment],
    );
    return NextResponse.json(row ? mapSlo(row) : null);
  }

  if (service) {
    const rows = await queryAll<SloRow>(
      `SELECT service, product, market, environment,
              target_success AS targetSuccess, updated_at AS updatedAt
         FROM slo_targets
        WHERE service = ?
        ORDER BY product ASC, market ASC, environment ASC`,
      [service],
    );
    return NextResponse.json({
      service,
      targets: rows.map(mapSlo),
    });
  }

  const rows = await queryAll<SloRow>(
    `SELECT service, product, market, environment,
            target_success AS targetSuccess, updated_at AS updatedAt
       FROM slo_targets
       ORDER BY service ASC, product ASC, market ASC, environment ASC`,
    [],
  );

  return NextResponse.json({
    targets: rows.map(mapSlo),
  });
}

export async function PUT(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const {
    service,
    targetSuccess,
    product = "platform",
    market = "ALL",
    environment = "prod",
  } = parsed.data;
  const now = Date.now();
  await queryRun(
    `INSERT INTO slo_targets (service, target_success, updated_at, product, market, environment)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (service, product, market, environment) DO UPDATE SET
         target_success = excluded.target_success,
         updated_at = excluded.updated_at`,
    [service, targetSuccess, now, product, market, environment],
  );

  return NextResponse.json({
    service,
    product,
    market,
    environment,
    targetSuccess,
    updatedAtMs: now,
  });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service")?.trim();
  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }
  const product = searchParams.get("product")?.trim();
  const market = searchParams.get("market")?.trim();
  const environment = searchParams.get("environment")?.trim();

  if (product && market && environment) {
    await queryRun(
      `DELETE FROM slo_targets WHERE service = ? AND product = ? AND market = ? AND environment = ?`,
      [service, product, market, environment],
    );
    return NextResponse.json({
      ok: true,
      service,
      product,
      market,
      environment,
    });
  }

  await queryRun(`DELETE FROM slo_targets WHERE service = ?`, [service]);
  return NextResponse.json({ ok: true, service, deletedAllDimensions: true });
}
