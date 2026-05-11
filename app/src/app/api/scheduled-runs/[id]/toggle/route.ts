/**
 * POST /api/scheduled-runs/[id]/toggle  body: { enabled: boolean }
 *      → { scheduled_run }
 *
 * Flips `scheduled_runs.enabled`. The cron scheduler's 30s sync loop picks up
 * the change automatically.
 */
import { getScheduledRun, toggleScheduledRun } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const existing = getScheduledRun(id);
  if (!existing) {
    return Response.json(
      { error: `scheduled_run '${id}' not found` },
      { status: 404 },
    );
  }

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as { enabled?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "enabled (boolean) required" },
      { status: 400 },
    );
  }
  const scheduled_run = toggleScheduledRun(id, body.enabled);
  return Response.json({ scheduled_run });
}
