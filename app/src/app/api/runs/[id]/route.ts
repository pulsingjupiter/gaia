/**
 * GET /api/runs/[id]  → { run, events } — full history for replay.
 *
 * Wave 2A.
 */
import { getRun, listRunEvents } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) {
    return Response.json({ error: `run '${id}' not found` }, { status: 404 });
  }
  const events = listRunEvents(id);
  return Response.json({ run, events });
}
