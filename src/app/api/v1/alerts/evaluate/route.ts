import { queryAll, queryGet, queryRun } from "@/db/client";
import {
  notifyGenericWebhook,
  notifyPagerDutyTrigger,
  notifySlackIncomingWebhook,
} from "@/lib/alert-notify";
import {
  loadAllRoutes,
  resolveRouteTargets,
  SEVERITIES,
  type Severity,
} from "@/lib/alert-routing-resolver";
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
  severity: string | null;
};

function parseSeverity(s: string | null): Severity {
  return s && (SEVERITIES as readonly string[]).includes(s)
    ? (s as Severity)
    : "warning";
}

/** Tiny stable hex digest of a string — used to tag per-target dedup keys.
 *  Not security-sensitive; FNV-1a is plenty for short, single-rule scopes. */
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

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
            product, market_scope, environment, severity
     FROM alert_rules WHERE enabled = 1`,
    [],
  );

  const allRoutes = await loadAllRoutes();

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
    severity: Severity;
    breachedMarkets: string[];
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
    const prod = r.product?.trim();
    const severity = parseSeverity(r.severity);

    const scopedMarkets = r.market_scope
      ? r.market_scope.split(",").map((m) => m.trim()).filter(Boolean)
      : [];

    function checkBreach(v: number): boolean {
      return r.comparator === "gt" ? v > r.threshold : v < r.threshold;
    }

    let observedAvg: number | null = null;
    let breachedMarkets: string[] = [];

    if (scopedMarkets.length >= 2) {
      // Multi-market scope — per-market breakdown so the resolver can route to
      // the specific markets that breached.
      const params: unknown[] = [
        tenantId,
        r.metric_name,
        r.service,
        since,
        env,
      ];
      let sql = `SELECT market, AVG(value) AS avg_value FROM metric_points
        WHERE tenant_id = ? AND name = ? AND service = ? AND ts >= ?
          AND environment = ?`;
      if (prod) {
        sql += ` AND product = ?`;
        params.push(prod);
      }
      const ph = scopedMarkets.map(() => "?").join(", ");
      sql += ` AND market IN (${ph}) GROUP BY market`;
      params.push(...scopedMarkets);

      const rows = await queryAll<{ market: string; avg_value: number | null }>(
        sql,
        params,
      );
      const valid = rows
        .map((rr) => ({ market: rr.market, v: rr.avg_value }))
        .filter((x): x is { market: string; v: number } =>
          x.v != null && Number.isFinite(Number(x.v)),
        );
      breachedMarkets = valid
        .filter((x) => checkBreach(Number(x.v)))
        .map((x) => x.market);
      observedAvg = valid.length
        ? valid.reduce((acc, x) => acc + Number(x.v), 0) / valid.length
        : null;
    } else {
      // 0 or 1 market in scope — single AVG (preserves prior semantics).
      const params: unknown[] = [
        tenantId,
        r.metric_name,
        r.service,
        since,
        env,
      ];
      let sql = `SELECT AVG(value) AS avg_value FROM metric_points
        WHERE tenant_id = ? AND name = ? AND service = ? AND ts >= ?
          AND environment = ?`;
      if (prod) {
        sql += ` AND product = ?`;
        params.push(prod);
      }
      if (scopedMarkets.length === 1) {
        sql += ` AND market = ?`;
        params.push(scopedMarkets[0]);
      }
      const row = await queryGet<{ avg_value: number | null }>(sql, params);
      observedAvg = row?.avg_value != null ? Number(row.avg_value) : null;
      const fires =
        observedAvg != null &&
        Number.isFinite(observedAvg) &&
        checkBreach(observedAvg);
      breachedMarkets = fires
        ? scopedMarkets.length === 1
          ? [scopedMarkets[0]]
          : ["ALL"]
        : [];
    }

    const firing = breachedMarkets.length > 0;

    const silenced = firing && (await ruleIsSilenced(tenantId, r.id, now));
    if (silenced) skippedSilence++;

    await logEvalSnapshot(
      tenantId,
      r.id,
      now,
      firing,
      observedAvg,
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
      severity,
      breachedMarkets,
      observedAvg,
      firing,
      silenced,
      evaluatedAtMs: now,
    });

    if (!firing || silenced) continue;

    const breachedSummary = breachedMarkets.length
      ? ` [${breachedMarkets.join(",")}]`
      : "";
    const summary = `Pulse alert: ${r.name} — ${r.metric_name} @ ${r.service} avg ${observedAvg != null ? observedAvg.toFixed(2) : "?"} (threshold ${r.comparator} ${r.threshold})${breachedSummary}`;

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
        severity,
        breachedMarkets,
      },
      observedAvg,
    };

    // Send through a channel + value pair, dedup keyed per-target so two
    // different Slack channels (e.g. #ops-ng and #ops-ke) don't suppress each
    // other for the same rule.
    type Dispatch = {
      channelType: "slack" | "pagerduty" | "webhook" | "email";
      value: string;
      reason: string;
    };
    const dispatches: Dispatch[] = [];
    const seenDispatch = new Set<string>();

    function addDispatch(d: Dispatch) {
      const key = `${d.channelType}::${d.value}`;
      if (seenDispatch.has(key)) return;
      seenDispatch.add(key);
      dispatches.push(d);
    }

    // 1. Rule-level overrides (highest precedence).
    if (r.webhook_url?.trim()) {
      addDispatch({
        channelType: "webhook",
        value: r.webhook_url.trim(),
        reason: "rule:webhook_url",
      });
    }
    if (r.slack_webhook_url?.trim()) {
      addDispatch({
        channelType: "slack",
        value: r.slack_webhook_url.trim(),
        reason: "rule:slack_webhook_url",
      });
    }
    if (r.pagerduty_routing_key?.trim()) {
      addDispatch({
        channelType: "pagerduty",
        value: r.pagerduty_routing_key.trim(),
        reason: "rule:pagerduty_routing_key",
      });
    }

    // 2. Resolver targets — per-market and team routes via alert_routes table.
    const ownerTeamRow = await queryGet<{ owner_team: string | null }>(
      `SELECT owner_team FROM service_catalog WHERE service_name = ?`,
      [r.service],
    );
    const ownerTeam = ownerTeamRow?.owner_team?.trim() || null;

    const routedTargets = resolveRouteTargets(
      {
        ruleId: r.id,
        ruleName: r.name,
        serviceName: r.service,
        ownerTeam,
        severity,
        breachedMarkets,
      },
      allRoutes,
    );
    for (const t of routedTargets) {
      addDispatch({
        channelType: t.channelType,
        value: t.channelValue,
        reason: t.reason,
      });
    }

    // 3. Send each unique dispatch with per-target dedup.
    for (const d of dispatches) {
      // Channel key includes a short value tag so the dedup table tracks each
      // distinct destination separately. 12 hex chars is plenty for collision
      // avoidance within a single rule's group window.
      const valueTag = simpleHash(d.value).slice(0, 12);
      const channelKey = `${d.channelType}:${valueTag}`;
      if (!(await shouldSendChannel(tenantId, r.id, channelKey, now))) {
        skippedDedupe++;
        continue;
      }
      try {
        if (d.channelType === "webhook") {
          await notifyGenericWebhook(d.value, payload);
        } else if (d.channelType === "slack") {
          await notifySlackIncomingWebhook(d.value, `🔥 ${summary}`);
        } else if (d.channelType === "pagerduty") {
          const dedupKey = `pulse-${tenantId}-rule${r.id}-${valueTag}-${Math.floor(now / win)}`;
          await notifyPagerDutyTrigger(d.value, summary, dedupKey);
        }
        // 'email' is reserved for a future notifier; skip silently for now.
      } catch {
        /* swallow per-target errors so one bad target doesn't kill the loop */
      }
      await logNotification(tenantId, r.id, channelKey, now);
      notificationsSent++;
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
