import { queryAll, queryGet, queryRun } from "@/db/client";
import {
  notifyGenericWebhook,
  notifyPagerDutyTrigger,
  notifySlackIncomingWebhook,
} from "@/lib/alert-notify";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

type RuleDbRow = {
  id: number;
  name: string;
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

function groupWindowMs(): number {
  const n = Number(process.env.PULSE_ALERT_GROUP_WINDOW_MS);
  return Number.isFinite(n) && n >= 60_000
    ? Math.min(n, 24 * 60 * 60 * 1000)
    : 30 * 60 * 1000;
}

async function ruleIsSilenced(
  tenantId: string,
  ruleId: number,
  now: number,
): Promise<boolean> {
  const row = await queryGet<{ one: number }>(
    `
    SELECT 1 AS one FROM alert_silences
    WHERE tenant_id = ?
      AND ends_at_ms > ?
      AND (rule_id IS NULL OR rule_id = ?)
    LIMIT 1
  `,
    [tenantId, now, ruleId],
  );
  return Boolean(row);
}

async function shouldSendChannel(
  tenantId: string,
  ruleId: number,
  channel: string,
  now: number,
): Promise<boolean> {
  const win = groupWindowMs();
  const row = await queryGet<{ lastMs: number | null }>(
    `
    SELECT MAX(sent_at_ms) AS lastMs FROM alert_notification_log
    WHERE tenant_id = ? AND rule_id = ? AND channel = ?
  `,
    [tenantId, ruleId, channel],
  );
  const last = row?.lastMs != null ? Number(row.lastMs) : null;
  if (last == null) return true;
  return now - last >= win;
}

async function logNotification(
  tenantId: string,
  ruleId: number,
  channel: string,
  sentAtMs: number,
): Promise<void> {
  await queryRun(
    `
    INSERT INTO alert_notification_log (tenant_id, rule_id, channel, sent_at_ms)
    VALUES (?, ?, ?, ?)
  `,
    [tenantId, ruleId, channel, sentAtMs],
  );
}

async function logEvalSnapshot(
  tenantId: string,
  ruleId: number,
  now: number,
  firing: boolean,
  observedAvg: number | null,
  silenced: boolean,
): Promise<void> {
  await queryRun(
    `
    INSERT INTO alert_eval_history (tenant_id, rule_id, evaluated_at_ms, firing, observed_avg, silenced)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [
      tenantId,
      ruleId,
      now,
      firing ? 1 : 0,
      observedAvg,
      silenced ? 1 : 0,
    ],
  );
}

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const rules = await queryAll<RuleDbRow>(
    `SELECT id, name, metric_name, service, comparator, threshold, window_minutes,
            webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key,
            product, market_scope, environment
     FROM alert_rules WHERE enabled = 1`,
    [],
  );

  const now = Date.now();
  const win = groupWindowMs();

  const results: {
    id: number;
    name: string;
    metricName: string;
    service: string;
    comparator: string;
    threshold: number;
    windowMinutes: number;
    runbookUrl: string | null;
    environment: string;
    product: string | null;
    marketScope: string | null;
    observedAvg: number | null;
    firing: boolean;
    silenced: boolean;
    evaluatedAtMs: number;
  }[] = [];

  let notificationsSent = 0;
  let skippedDedupe = 0;
  let skippedSilence = 0;

  for (const r of rules) {
    const since = now - r.window_minutes * 60 * 1000;
    const env = (r.environment ?? "prod").trim() || "prod";
    const metricParams: unknown[] = [
      tenantId,
      r.metric_name,
      r.service,
      since,
      env,
    ];
    let metricSql = `SELECT AVG(value) AS avg_value FROM metric_points
      WHERE tenant_id = ? AND name = ? AND service = ? AND ts >= ?
        AND environment = ?`;

    const prod = r.product?.trim();
    if (prod) {
      metricSql += ` AND product = ?`;
      metricParams.push(prod);
    }

    if (r.market_scope) {
      const markets = r.market_scope.split(",").filter(Boolean);
      if (markets.length > 0) {
        const ph = markets.map(() => "?").join(", ");
        metricSql += ` AND market IN (${ph})`;
        metricParams.push(...markets);
      }
    }

    const row = await queryGet<{ avg_value: number | null }>(
      metricSql,
      metricParams,
    );
    const value = row?.avg_value ?? null;
    let firing = false;
    if (value != null && Number.isFinite(Number(value))) {
      const v = Number(value);
      firing = r.comparator === "gt" ? v > r.threshold : v < r.threshold;
    }

    const silenced = firing && (await ruleIsSilenced(tenantId, r.id, now));
    if (silenced) skippedSilence++;

    await logEvalSnapshot(
      tenantId,
      r.id,
      now,
      firing,
      value != null ? Number(value) : null,
      silenced,
    );

    results.push({
      id: r.id,
      name: r.name,
      metricName: r.metric_name,
      service: r.service,
      comparator: r.comparator,
      threshold: Number(r.threshold),
      windowMinutes: r.window_minutes,
      runbookUrl: r.runbook_url ?? null,
      environment: env,
      product: prod ?? null,
      marketScope: r.market_scope ?? null,
      observedAvg: value != null ? Number(value) : null,
      firing,
      silenced,
      evaluatedAtMs: now,
    });

    if (!firing || silenced) continue;

    const summary = `Pulse alert: ${r.name} — ${r.metric_name} @ ${r.service} avg ${value != null ? Number(value).toFixed(2) : "?"} (threshold ${r.comparator} ${r.threshold})`;

    const payload = {
      event: "pulse.alert.firing",
      evaluatedAtMs: now,
      rule: {
        id: r.id,
        name: r.name,
        metricName: r.metric_name,
        service: r.service,
        comparator: r.comparator,
        threshold: r.threshold,
        windowMinutes: r.window_minutes,
        runbookUrl: r.runbook_url ?? null,
      },
      observedAvg: value != null ? Number(value) : null,
    };

    if (r.webhook_url?.trim()) {
      const ch = "webhook";
      if (await shouldSendChannel(tenantId, r.id, ch, now)) {
        await notifyGenericWebhook(r.webhook_url.trim(), payload);
        await logNotification(tenantId, r.id, ch, now);
        notificationsSent++;
      } else {
        skippedDedupe++;
      }
    }

    if (r.slack_webhook_url?.trim()) {
      const ch = "slack";
      if (await shouldSendChannel(tenantId, r.id, ch, now)) {
        await notifySlackIncomingWebhook(
          r.slack_webhook_url.trim(),
          `🔥 ${summary}`,
        );
        await logNotification(tenantId, r.id, ch, now);
        notificationsSent++;
      } else {
        skippedDedupe++;
      }
    }

    if (r.pagerduty_routing_key?.trim()) {
      const ch = "pagerduty";
      if (await shouldSendChannel(tenantId, r.id, ch, now)) {
        const dedupKey = `pulse-${tenantId}-rule${r.id}-${Math.floor(now / win)}`;
        await notifyPagerDutyTrigger(
          r.pagerduty_routing_key.trim(),
          summary,
          dedupKey,
        );
        await logNotification(tenantId, r.id, ch, now);
        notificationsSent++;
      } else {
        skippedDedupe++;
      }
    }
  }

  return NextResponse.json({
    evaluatedAtMs: now,
    results,
    firingCount: results.filter((x) => x.firing).length,
    webhooksSent: notificationsSent,
    notificationsSent,
    skippedDedupe,
    skippedSilence,
    groupWindowMs: win,
  });
}
