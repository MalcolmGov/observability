import { queryAll, queryGet } from "@/db/client";
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
};

async function notifyWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<void> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch {
    /* best-effort */
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const rules = await queryAll<RuleDbRow>(
    `SELECT id, name, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url FROM alert_rules WHERE enabled = 1`,
    [],
  );

  const now = Date.now();

const results: {
    id: number;
    name: string;
    metricName: string;
    service: string;
    comparator: string;
    threshold: number;
    windowMinutes: number;
    runbookUrl: string | null;
    observedAvg: number | null;
    firing: boolean;
    evaluatedAtMs: number;
  }[] = [];
  for (const r of rules) {
    const since = now - r.window_minutes * 60 * 1000;
    const row = await queryGet<{ avg_value: number | null }>(
      `SELECT AVG(value) AS avg_value FROM metric_points WHERE name = ? AND service = ? AND ts >= ?`,
      [r.metric_name, r.service, since],
    );
    const value = row?.avg_value ?? null;
    let firing = false;
    if (value != null && Number.isFinite(Number(value))) {
      const v = Number(value);
      firing =
        r.comparator === "gt" ? v > r.threshold : v < r.threshold;
    }
    results.push({
      id: r.id,
      name: r.name,
      metricName: r.metric_name,
      service: r.service,
      comparator: r.comparator,
      threshold: Number(r.threshold),
      windowMinutes: r.window_minutes,
      runbookUrl: r.runbook_url ?? null,
      observedAvg: value != null ? Number(value) : null,
      firing,
      evaluatedAtMs: now,
    });
  }

  const webhooks = rules
    .map((r, i) => ({ rule: r, result: results[i] }))
    .filter(
      (x) =>
        x.result.firing &&
        Boolean(x.rule.webhook_url && x.rule.webhook_url.trim()),
    );

  await Promise.all(
    webhooks.map(({ rule, result }) =>
      notifyWebhook(rule.webhook_url!.trim(), {
        event: "pulse.alert.firing",
        evaluatedAtMs: now,
        rule: {
          id: rule.id,
          name: rule.name,
          metricName: rule.metric_name,
          service: rule.service,
          comparator: rule.comparator,
          threshold: rule.threshold,
          windowMinutes: rule.window_minutes,
          runbookUrl: rule.runbook_url ?? null,
        },
        observedAvg: result.observedAvg,
      }),
    ),
  );

  return NextResponse.json({
    evaluatedAtMs: now,
    results,
    firingCount: results.filter((x) => x.firing).length,
    webhooksSent: webhooks.length,
  });
}
