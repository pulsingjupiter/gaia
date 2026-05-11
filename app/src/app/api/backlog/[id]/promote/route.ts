/**
 * POST /api/backlog/[id]/promote
 *      → moves a task out of the backlog and into the active sprint by setting
 *        status='todo'. Returns { task }.
 *
 * Wave 1.
 */
import { getTask, updateTask } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const existing = getTask(id);
  if (!existing) {
    return Response.json({ error: `task '${id}' not found` }, { status: 404 });
  }
  const task = updateTask(id, { status: "todo" });
  return Response.json({ task });
}
