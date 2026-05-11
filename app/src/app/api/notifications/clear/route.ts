/**
 * POST /api/notifications/clear → { ok: true, deleted: number }
 *
 * Hard-deletes notification messages (kind='notification'). Body is optional —
 * when `{ thread_id }` is supplied the delete is scoped to that thread,
 * otherwise every notification across every thread is cleared. Used by the
 * conversations header "Clear notifications" button and the Settings →
 * Data "Clear all notifications" affordance.
 */
import { clearNotifications } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  thread_id?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let payload: Body | null = null;
  try {
    // Empty body is allowed — clears across all threads.
    const text = await request.text();
    payload = text ? (JSON.parse(text) as Body) : null;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let thread_id: string | undefined;
  if (payload && typeof payload === "object") {
    if (payload.thread_id !== undefined) {
      if (typeof payload.thread_id !== "string" || !payload.thread_id.trim()) {
        return Response.json(
          { error: "thread_id must be a non-empty string when provided" },
          { status: 400 },
        );
      }
      thread_id = payload.thread_id.trim();
    }
  }

  const deleted = clearNotifications(thread_id ? { thread_id } : undefined);
  return Response.json({ ok: true, deleted });
}
