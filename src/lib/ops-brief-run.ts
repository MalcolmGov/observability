import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

import { opsBriefSchema, type OpsBrief } from "@/lib/ops-brief-schema";
import type { OpsBriefSnapshot } from "@/lib/ops-brief-snapshot";

const SYSTEM = `You are an AI Ops assistant generating a short stakeholder brief for an observability platform called Pulse.

Hard rules:
- Use ONLY facts present in the JSON snapshot. Do not invent incidents, customers, or outages.
- If there is little or no telemetry, say that clearly and recommend loading demo data or checking ingest.
- Keep tone confident, concise, and suitable for executives and engineering leaders.
- Risks and actions must be grounded in the numbers and sample errors given (or say "none evident from current signals" when appropriate).
- Do not claim autonomous remediation or guaranteed root cause — frame as assessment and suggested focus areas.`;

export async function runOpsBriefPlanner(
  snapshot: OpsBriefSnapshot,
): Promise<OpsBrief> {
  const modelId =
    process.env.OPENAI_OPS_BRIEF_MODEL?.trim() ||
    process.env.OPENAI_NL_MODEL?.trim() ||
    "gpt-4o-mini";

  const { object } = await generateObject({
    model: openai(modelId),
    schema: opsBriefSchema,
    system: SYSTEM,
    prompt: `Telemetry snapshot (JSON):\n${JSON.stringify(snapshot, null, 2)}`,
  });

  return object;
}
