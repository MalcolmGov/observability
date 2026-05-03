import "server-only";

async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch {
    /* best-effort */
  } finally {
    clearTimeout(t);
  }
}

export async function notifyGenericWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<void> {
  await postJson(url, body);
}

/** Slack Incoming Webhooks expect `{ text: "..." }`. */
export async function notifySlackIncomingWebhook(
  url: string,
  text: string,
): Promise<void> {
  await postJson(url, { text });
}

/** PagerDuty Events API v2 `trigger`. */
export async function notifyPagerDutyTrigger(
  routingKey: string,
  summary: string,
  dedupKey: string,
): Promise<void> {
  await postJson(
    "https://events.pagerduty.com/v2/enqueue",
    {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: dedupKey.slice(0, 255),
      payload: {
        summary: summary.slice(0, 1024),
        severity: "error",
        source: "pulse-alerts",
      },
    },
    {},
  );
}
