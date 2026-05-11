/**
 * GET /api/notifications/unread-count
 *   → {
 *       total: number,                  // unread chat + notification + pending approvals
 *       by_thread: Record<string, number>,
 *       by_kind: { chat, notification },
 *       pending_approvals: number,      // approvals.status='pending' count
 *     }
 */
import { countPendingApprovals, unreadCounts } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  ensureSeeded();
  const counts = unreadCounts();
  const pending_approvals = countPendingApprovals();
  return Response.json({
    ...counts,
    total: counts.total + pending_approvals,
    pending_approvals,
  });
}
