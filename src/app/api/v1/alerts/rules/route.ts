import {
  queryAll,
  queryGet,
  queryRun,
} from "@/db/client";
import {
  normalizeMarketScope,
  ValidationError as MarketScopeValidationError,
} from "@/lib/market-scope";
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
  slack_webhook_url: string | null;
  pagerduty_routing_key: string | null;
  product: string | null;
  market_scope: string | null;
  environment: string | null;
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
    slackWebhookUrl: r.slack_webhook_url ?? null,
    pagerdutyRoutingKey: r.pagerduty_routing_key ?? null,
    product: r.product ?? null,
    marketScope: r.market_scope ?? null,
    environment: r.environment ?? "prod",
  };
}

export async function GET() {
  const rows = await queryAll<RuleDbRow>(
    `SELECT id, name, enabled, metric_name, service, comparator, threshold, window_minutes,
            webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key,
            product, market_scope, environment
     FROM alert_rules ORDER BY id ASC`,
    [],
  );
  return NextResponse.json({
    rules: rows.map(mapRule),
  });
}

const urlOrEmpty = z.union([z.string().url(), z.literal("")]);

const postSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  metric_name: z.string().min(1),
  service: z.string().min(1),
  comparator: z.enum(["gt", "lt"]),
  threshold: z.number().finite(),
  window_minutes: z.number().int().min(1).max(1440).optional(),
  webhook_url: urlOrEmpty.optional(),
  runbook_url: urlOrEmpty.optional(),
  slack_webhook_url: urlOrEmpty.optional(),
  pagerduty_routing_key: z.union([z.string().min(8).max(64), z.literal("")]).optional(),
  product: z.string().min(1).max(64).optional().nullable(),
  market_scope: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional(),
  environment: z.string().min(1).max(64).optional(),
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

  let marketScopeCanonical: string | null;
  try {
    marketScopeCanonical = normalizeMarketScope(parsed.data.market_scope);
  } catch (e) {
    if (e instanceof MarketScopeValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const p = parsed.data;
  const webhook =
    p.webhook_url && p.webhook_url.length > 0 ? p.webhook_url : null;
  const runbook =
    p.runbook_url && p.runbook_url.length > 0 ? p.runbook_url : null;
  const slack =
    p.slack_webhook_url && p.slack_webhook_url.length > 0
      ? p.slack_webhook_url
      : null;
  const pd =
    p.pagerduty_routing_key && p.pagerduty_routing_key.length > 0
      ? p.pagerduty_routing_key
      : null;
  const product = p.product?.trim() ? p.product.trim() : null;
  const environment = p.environment?.trim() ?? "prod";

  let id: number;
  if (isPostgres()) {
    const row = await queryGet<{ id: number }>(
      `INSERT INTO alert_rules (name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key, product, market_scope, environment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
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
        slack,
        pd,
        product,
        marketScopeCanonical,
        environment,
      ],
    );
    id = Number(row?.id);
  } else {
    await queryRun(
      `INSERT INTO alert_rules (name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key, product, market_scope, environment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        slack,
        pd,
        product,
        marketScopeCanonical,
        environment,
      ],
    );
    const lid = await queryGet<{ id: number }>(
      `SELECT last_insert_rowid() AS id`,
      [],
    );
    id = Number(lid?.id);
  }

  const row = await queryGet<RuleDbRow>(
    `SELECT id, name, enabled, metric_name, service, comparator, threshold, window_minutes,
            webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key,
            product, market_scope, environment
     FROM alert_rules WHERE id = ?`,
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

const patchSchema = z
  .object({
    id: z.number().int().positive(),
    runbook_url: urlOrEmpty.optional(),
    webhook_url: urlOrEmpty.optional(),
    slack_webhook_url: urlOrEmpty.optional(),
    pagerduty_routing_key: z.union([z.string().min(8).max(64), z.literal("")]).optional(),
    product: z.string().min(1).max(64).optional().nullable(),
    market_scope: z
      .union([z.string(), z.array(z.string()), z.null()])
      .optional(),
    environment: z.string().min(1).max(64).optional(),
  })
  .refine(
    (d) =>
      d.runbook_url !== undefined ||
      d.webhook_url !== undefined ||
      d.slack_webhook_url !== undefined ||
      d.pagerduty_routing_key !== undefined ||
      d.product !== undefined ||
      d.market_scope !== undefined ||
      d.environment !== undefined,
    { message: "At least one field to update is required" },
  );

/** Update URLs, runbook, scope columns on an existing rule. */
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

  const { id } = parsed.data;

  const assignments: string[] = [];
  const params: unknown[] = [];

  if (parsed.data.runbook_url !== undefined) {
    assignments.push("runbook_url = ?");
    params.push(
      parsed.data.runbook_url.length > 0 ? parsed.data.runbook_url : null,
    );
  }
  if (parsed.data.webhook_url !== undefined) {
    assignments.push("webhook_url = ?");
    params.push(
      parsed.data.webhook_url.length > 0 ? parsed.data.webhook_url : null,
    );
  }
  if (parsed.data.slack_webhook_url !== undefined) {
    assignments.push("slack_webhook_url = ?");
    params.push(
      parsed.data.slack_webhook_url.length > 0
        ? parsed.data.slack_webhook_url
        : null,
    );
  }
  if (parsed.data.pagerduty_routing_key !== undefined) {
    assignments.push("pagerduty_routing_key = ?");
    params.push(
      parsed.data.pagerduty_routing_key.length > 0
        ? parsed.data.pagerduty_routing_key
        : null,
    );
  }
  if (parsed.data.product !== undefined) {
    assignments.push("product = ?");
    params.push(
      parsed.data.product?.trim() ? parsed.data.product.trim() : null,
    );
  }
  if (parsed.data.market_scope !== undefined) {
    let canon: string | null;
    try {
      canon = normalizeMarketScope(parsed.data.market_scope);
    } catch (e) {
      if (e instanceof MarketScopeValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
    assignments.push("market_scope = ?");
    params.push(canon);
  }
  if (parsed.data.environment !== undefined) {
    assignments.push("environment = ?");
    params.push(parsed.data.environment.trim() || "prod");
  }

  if (assignments.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  params.push(id);
  await queryRun(
    `UPDATE alert_rules SET ${assignments.join(", ")} WHERE id = ?`,
    params,
  );

  const row = await queryGet<RuleDbRow>(
    `SELECT id, name, enabled, metric_name, service, comparator, threshold, window_minutes,
            webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key,
            product, market_scope, environment
     FROM alert_rules WHERE id = ?`,
    [id],
  );
  return NextResponse.json({ rule: row ? mapRule(row) : null });
}
