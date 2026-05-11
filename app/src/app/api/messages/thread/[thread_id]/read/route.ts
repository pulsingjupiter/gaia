/**
 * POST /api/messages/thread/[thread_id]/read  → { ok: true, marked: number }
 *
 * Marks every unread message in the thread as read.
 */
import { markThreadRead } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ thread_id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { thread_id } = await ctx.params;
  if (!thread_id) {
    return Response.json({ error: "missing thread_id" }, { status: 400 });
  }
  const marked = markThreadRead(thread_id);
  return Response.json({ ok: true, marked });
}
