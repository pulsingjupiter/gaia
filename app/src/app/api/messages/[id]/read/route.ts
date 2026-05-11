/**
 * POST /api/messages/[id]/read  → { ok: true }
 *
 * Marks a single message row as read (sets read_at = now). Idempotent — a
 * second call on an already-read message is a no-op and still returns ok.
 */
import { markMessageRead } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }
  markMessageRead(id);
  return Response.json({ ok: true });
}
