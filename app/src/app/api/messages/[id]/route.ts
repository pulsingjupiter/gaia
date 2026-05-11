/**
 * DELETE /api/messages/[id] → { ok: true }
 *
 * Hard-deletes a single message row (chat or notification). Returns 404 when
 * no row matches the supplied id. Companion to the existing
 * `[id]/read/route.ts` (POST) — they coexist at different segments.
 */
import { deleteMessage } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }
  const ok = deleteMessage(id);
  if (!ok) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
