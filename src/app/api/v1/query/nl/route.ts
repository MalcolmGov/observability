import {
  executeNlQuery,
} from "@/lib/nl-query-handlers";
import { getNlClientIdFromRequest } from "@/lib/nl-query-client-id";
import { requireNlQueryApiAuth } from "@/lib/nl-query-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  prompt: z.string(),
  pageHint: z.enum(["logs", "metrics", "traces"]).optional(),
});

export async function POST(req: Request) {
  const unauthorized = requireNlQueryApiAuth(req);
  if (unauthorized) return unauthorized;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const clientId = getNlClientIdFromRequest(req);
  const result = await executeNlQuery({
    prompt: parsed.data.prompt,
    pageHint: parsed.data.pageHint,
    clientId,
  });

  if (!result.ok) {
    let status = 400;
    if (result.error.startsWith("Too many natural-language")) status = 429;
    else if (result.error.includes("OPENAI_API_KEY")) status = 503;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
