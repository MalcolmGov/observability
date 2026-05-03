import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

import type { TraceCopilotBrief } from "@/lib/trace-copilot-schema";
import { traceCopilotSchema } from "@/lib/trace-copilot-schema";
import type { TraceCopilotPayload } from "@/lib/trace-copilot-snapshot";

const SYSTEM = `You are an observability copilot helping engineers interpret a distributed trace in Pulse.

Strict rules:
- Explain ONLY what is supported by the span list and fields provided (service, name, kind, status, durationMs, peerService, relative ordering via startTs).
- Do not invent HTTP status codes, database queries, or infrastructure failures unless they appear in span attributes.
- If attributes are sparse, say so and focus on structure (which service called which, where time went, where errors are).
- Use cautious language for root cause ("may", "suggests") — you do not have logs or metrics outside this trace.
- timelineBullets should follow chronological order by startTs when possible.
- hotspots must mention concrete span names and services from the data when referencing latency or errors.
- suggestedChecks should be practical (open logs for trace X, inspect downstream Y, compare p95, etc.).`;

export async function runTraceCopilot(
  payload: TraceCopilotPayload,
): Promise<TraceCopilotBrief> {
  const modelId =
    process.env.OPENAI_TRACE_COPILOT_MODEL?.trim() ||
    process.env.OPENAI_NL_MODEL?.trim() ||
    "gpt-4o-mini";

  const { object } = await generateObject({
    model: openai(modelId),
    schema: traceCopilotSchema,
    system: SYSTEM,
    prompt: `Trace payload (JSON). spans may be a subset if spansTruncated is true.\n${JSON.stringify(payload, null, 2)}`,
  });

  return object;
}
