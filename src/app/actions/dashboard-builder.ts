"use server";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export type ChartConfig = {
  id: string;
  title: string;
  type: "line" | "bar" | "area";
  metric: string;
  service: string;
  description: string;
};

export type DashboardBuilderResult =
  | { success: true; charts: ChartConfig[] }
  | { success: false; error: string };

export async function generateDashboardAction(
  prompt: string
): Promise<DashboardBuilderResult> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "Missing OPENAI_API_KEY." };
    }

    const systemPrompt = `
You are an expert Observability Engineer. The user will ask for a custom dashboard or metrics visualization in natural language.
Your job is to translate their request into a structured JSON array of chart configurations.

Supported Chart Types: "line", "bar", "area".
Available Metrics: "http.server.request_duration_ms", "cpu.usage", "memory.usage", "error_rate", "active_users", "transaction_volume".

Output your response ONLY as valid JSON matching this schema:
[
  {
    "id": "unique-string",
    "title": "Human Readable Title",
    "type": "line",
    "metric": "metric_name",
    "service": "target_service_or_all",
    "description": "Brief explanation of what this chart shows"
  }
]
`;

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      system: systemPrompt,
      temperature: 0.1,
    });

    // Extract JSON from response (in case it includes markdown code blocks)
    let jsonString = text;
    if (jsonString.includes("\`\`\`json")) {
      jsonString = jsonString.split("\`\`\`json")[1].split("\`\`\`")[0].trim();
    } else if (jsonString.includes("\`\`\`")) {
      jsonString = jsonString.split("\`\`\`")[1].split("\`\`\`")[0].trim();
    }

    const charts = JSON.parse(jsonString) as ChartConfig[];
    return { success: true, charts };
  } catch (error: any) {
    console.error("Dashboard generation failed:", error);
    return { success: false, error: error.message || "Failed to generate dashboard layout." };
  }
}
