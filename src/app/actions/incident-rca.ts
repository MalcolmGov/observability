"use server";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export type RcaResult =
  | { success: true; markdown: string }
  | { success: false; error: string };

export async function generateIncidentRcaAction(
  incidentMeta: {
    ruleName: string;
    service: string;
    severity: string;
    metricStr: string | null;
    observedAvg: number | null;
    evaluatedAtMs: number;
  },
  logs: { ts: number; level: string; message: string }[]
): Promise<RcaResult> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "Missing OPENAI_API_KEY. Cannot generate RCA." };
    }

    const logContext = logs.length > 0 
      ? logs.map(l => `[${new Date(l.ts).toISOString()}] ${l.level.toUpperCase()}: ${l.message}`).join("\n")
      : "No recent error logs available for this service.";

    const prompt = `
You are a Senior Site Reliability Engineer (SRE). 
An incident has just triggered. Analyze the following incident metadata and recent error logs to determine the likely root cause.

## Incident Metadata
- **Rule Name**: ${incidentMeta.ruleName}
- **Service**: ${incidentMeta.service}
- **Severity**: ${incidentMeta.severity}
- **Condition**: ${incidentMeta.metricStr || "N/A"}
- **Observed Value**: ${incidentMeta.observedAvg?.toFixed(2) || "N/A"}
- **Time**: ${new Date(incidentMeta.evaluatedAtMs).toISOString()}

## Recent Error Logs (Last 8)
\`\`\`
${logContext}
\`\`\`

Based on the above information, please provide a concise, highly technical SRE briefing.
Format your response exactly as follows:

### 🔍 Anomaly Summary
- Bullet 1 (What happened)
- Bullet 2 (Why it happened based on logs/metrics)
- Bullet 3 (Impact radius)

### 🛠️ Immediate Remediation Steps
1. Step 1 (Actionable, specific command or mitigation)
2. Step 2 (Follow-up investigation or fix)

Keep the tone professional, urgent, and precise. Use markdown formatting.
`;

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      temperature: 0.3, // Low temperature for factual, analytical responses
    });

    return { success: true, markdown: text };
  } catch (error: any) {
    console.error("AI RCA generation failed:", error);
    return { success: false, error: error.message || "Failed to generate AI brief." };
  }
}
