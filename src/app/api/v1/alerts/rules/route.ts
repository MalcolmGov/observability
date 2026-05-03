import {
  queryAll,
  queryGet,
  queryRun,
} from "@/db/client";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";
import { z } from "zod";

type RuleDbRow = {
  id: number;
  name: string;
  enabled: number;
  metric_name: string;
  service: string;
  comparator: string;
  threshold: number;
  window_minutes: number;
  webhook_url: string | null;
  runbook_url: string | null;
};

function mapRule(r: RuleDbRow) {
  return {
    id: r.id,
    name: r.name,
    enabled: Boolean(r.enabled),
    metricName: r.metric_name,
    service: r.service,
    comparator: r.comparator,
    threshold: Number(r.threshold),
    windowMinutes: r.window_minutes,
    webhookUrl: r.webhook_url ?? null,
    runbookUrl: r.runbook_url ?? null,
  };
}

export async function GET() {
  const rows = await queryAll<RuleDbRow>(
    `SELECT id, name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url FROM alert_rules ORDER BY id ASC`,
    [],
  );
  return NextResponse.json({
    rules: rows.map(mapRule),
  });
}

const postSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  metric_name: z.string().min(1),
  service: z.string().min(1),
  comparator: z.enum(["gt", "lt"]),
  threshold: z.number().finite(),
  window_minutes: z.number().int().min(1).max(1440).optional(),
  webhook_url: z.union([z.string().url(), z.literal("")]).optional(),
  runbook_url: z.union([z.string().url(), z.literal("")]).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const p = parsed.data;
  const webhook =
    p.webhook_url && p.webhook_url.length > 0 ? p.webhook_url : null;
  const runbook =
    p.runbook_url && p.runbook_url.length > 0 ? p.runbook_url : null;

  let id: number;
  if (isPostgres()) {
    const row = await queryGet<{ id: number }>(
      `INSERT INTO alert_rules (name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
      [
        p.name,
        p.enabled === false ? 0 : 1,
        p.metric_name,
        p.service,
        p.comparator,
        p.threshold,
        p.window_minutes ?? 5,
        webhook,
        runbook,
      ],
    );
    id = Number(row?.id);
  } else {
    await queryRun(
      `INSERT INTO alert_rules (name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        p.name,
        p.enabled === false ? 0 : 1,
        p.metric_name,
        p.service,
        p.comparator,
        p.threshold,
        p.window_minutes ?? 5,
        webhook,
        runbook,
      ],
    );
    const lid = await queryGet<{ id: number }>(
      `SELECT last_insert_rowid() AS id`,
      [],
    );
    id = Number(lid?.id);
  }

  const row = await queryGet<RuleDbRow>(
    `SELECT id, name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url FROM alert_rules WHERE id = ?`,
    [id],
  );

  return NextResponse.json(
    {
      rule: row ? mapRule(row) : null,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await queryRun(`DELETE FROM alert_rules WHERE id = ?`, [id]);
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  runbook_url: z.union([z.string().url(), z.literal("")]),
});

/** Update runbook URL for an existing rule. */
export async function PATCH(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { id, runbook_url } = parsed.data;
  const runbook = runbook_url.length > 0 ? runbook_url : null;

  await queryRun(`UPDATE alert_rules SET runbook_url = ? WHERE id = ?`, [
    runbook,
    id,
  ]);

  const row = await queryGet<Pick<RuleDbRow, "id" | "runbook_url">>(
    `SELECT id, runbook_url FROM alert_rules WHERE id = ?`,
    [id],
  );
  return NextResponse.json({
    rule: row
      ? {
          id: row.id,
          runbookUrl: row.runbook_url ?? null,
        }
      : null,
  });
}
