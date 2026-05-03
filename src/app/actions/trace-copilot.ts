"use server";

import { getNlClientIdFromServerAction } from "@/lib/nl-query-client-id";
import { nlQueryRateLimitExceeded } from "@/lib/nl-query-rate-limit";
import { getTelemetryTenantId } from "@/lib/telemetry-tenant";
import type { TraceCopilotBrief } from "@/lib/trace-copilot-schema";
import { runTraceCopilot } from "@/lib/trace-copilot-run";
import {
  isValidTraceIdForCopilot,
  loadTraceCopilotPayload,
} from "@/lib/trace-copilot-snapshot";

export type ExplainTraceResult =
  | { ok: true; brief: TraceCopilotBrief }
  | { ok: false; error: string };

export async function explainTraceAction(
  traceId: string,
): Promise<ExplainTraceResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      error:
        "Add OPENAI_API_KEY to your environment to use Explain this trace.",
    };
  }

  const tid = traceId.trim();
  if (!isValidTraceIdForCopilot(tid)) {
    return {
      ok: false,
      error: "Invalid trace id.",
    };
  }

  const clientId = await getNlClientIdFromServerAction();
  if (nlQueryRateLimitExceeded(`${clientId}:trace-copilot:${tid}`)) {
    return {
      ok: false,
      error:
        "Too many explanations requested. Try again in about a minute.",
    };
  }

  try {
    const tenantId = await getTelemetryTenantId();
    const payload = await loadTraceCopilotPayload(tid, tenantId);
    if (!payload) {
      return { ok: false, error: "Trace not found." };
    }
    const brief = await runTraceCopilot(payload);
    return { ok: true, brief };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not explain this trace.",
    };
  }
}
