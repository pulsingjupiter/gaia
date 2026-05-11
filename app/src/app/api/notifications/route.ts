/**
 * GET /api/notifications?unread_only=1&limit=50
 *   → { notifications: MessageRow[] }
 *
 * Notification messages are rows in the `messages` table with `kind =
 * 'notification'`. Always ordered by created_at DESC.
 */
import type { NextRequest } from "next/server";

import { listNotifications } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const unread_only = sp.get("unread_only") === "1";
  const limitRaw = sp.get("limit");
  const recipient_id = sp.get("recipient_id") ?? undefined;
  let limit = 50;
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return Response.json(
        { error: "limit must be positive" },
        { status: 400 },
      );
    }
    limit = Math.min(500, Math.floor(n));
  }
  const notifications = listNotifications({
    unread_only,
    limit,
    recipient_id,
  });
  return Response.json({ notifications });
}
