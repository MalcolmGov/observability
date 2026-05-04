"use server";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export type PostMortemResult =
  | { success: true; markdown: string }
  | { success: false; error: string };

export async function generatePostMortemAction(
  incidentMeta: {
    ruleName: string;
    service: string;
    severity: string;
    durationMinutes: number;
    resolvedAtMs: number;
  },
  logs: { ts: number; level: string; message: string }[]
): Promise<PostMortemResult> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "Missing OPENAI_API_KEY. Cannot generate post-mortem." };
    }

    const logContext = logs.length > 0 
      ? logs.map(l => `[${new Date(l.ts).toISOString()}] ${l.level.toUpperCase()}: ${l.message}`).join("\n")
      : "No recent error logs available.";

    const prompt = `
You are a Staff Site Reliability Engineer writing a formal Incident Post-Mortem.
Based on the following incident data and error logs, generate a professional, highly technical post-mortem document.

## Incident Details
- **Service**: ${incidentMeta.service}
- **Rule Triggered**: ${incidentMeta.ruleName}
- **Severity**: ${incidentMeta.severity}
- **Duration**: ~${incidentMeta.durationMinutes} minutes
- **Resolution Time**: ${new Date(incidentMeta.resolvedAtMs).toISOString()}

## Telemetry / Error Logs
\`\`\`
${logContext}
\`\`\`

## Required Format
Please output the post-mortem exactly in the following Markdown format. Make it sound professional, blameless, and technical. Extrapolate reasonable assumptions for the "Impact" based on the service name (e.g., if it's "api-gateway", mention failed routing).

# Incident Post-Mortem: ${incidentMeta.service} Outage

**Date:** ${new Date(incidentMeta.resolvedAtMs).toISOString().split('T')[0]}
**Authors:** Pulse AI Copilot
**Status:** Resolved

### 1. Executive Summary
(Write a 2-3 sentence high-level summary of what happened, how long it lasted, and the business impact).

### 2. Leadup & Detection
(How was this detected? Based on the logs, what were the first signs of failure?)

### 3. Root Cause
(Analyze the logs provided. What was the exact technical failure?)

### 4. Resolution
(What steps were taken to mitigate and resolve the issue? Be specific).

### 5. Action Items
- [ ] Action item 1 (Preventative)
- [ ] Action item 2 (Monitoring/Detection improvement)
- [ ] Action item 3 (Process improvement)
`;

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      temperature: 0.4,
    });

    return { success: true, markdown: text };
  } catch (error: any) {
    console.error("AI Post-Mortem generation failed:", error);
    return { success: false, error: error.message || "Failed to generate AI post-mortem." };
  }
}
