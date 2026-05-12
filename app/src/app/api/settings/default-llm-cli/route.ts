/**
 * GET   /api/settings/default-llm-cli → { value: PlannerCli }
 * PATCH /api/settings/default-llm-cli  body: { value: PlannerCli }
 *
 * Single-key settings endpoint backing the "Default planner CLI" preference
 * in the Settings page. Used by Plan with Gaia and Gaia AI Assess to pick
 * which headless CLI to invoke.
 */
import { getDefaultLlmCli, setDefaultLlmCli } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { isPlannerCli } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(): Promise<Response> {
  ensureSeeded();
  return Response.json({ value: getDefaultLlmCli() });
}

export async function PATCH(request: Request): Promise<Response> {
  ensureSeeded();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest("body must be object");
  }
  const value = (body as { value?: unknown }).value;
  if (!isPlannerCli(value)) {
    return badRequest("value must be 'claude' | 'codex' | 'gemini'");
  }
  setDefaultLlmCli(value);
  return Response.json({ value: getDefaultLlmCli() });
}
