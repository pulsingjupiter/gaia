/**
 * POST /api/tasks/[id]/toggle  body: { enabled: boolean }  → { task }
 *
 * Flips `tasks.enabled`. The cron scheduler's 30s sync loop picks up the
 * change automatically — no need to restart anything.
 */
import { getTask, updateTask } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const existing = getTask(id);
  if (!existing) {
    return Response.json({ error: `task '${id}' not found` }, { status: 404 });
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
  const task = updateTask(id, { enabled: body.enabled });
  return Response.json({ task });
}
