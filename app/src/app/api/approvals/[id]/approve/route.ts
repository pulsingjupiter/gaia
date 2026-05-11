/**
 * POST /api/approvals/[id]/approve  body { notes? }
 *   → { approval: ApprovalRow }
 *
 * Marks the approval as approved + drops a notification message into the
 * agent's user-facing thread so the chat panel surfaces the resolution.
 */
import {
  getApproval,
  insertNotification,
  resolveApproval,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { notes?: string | null };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  let body: Body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const existing = getApproval(id);
  if (!existing) {
    return Response.json({ error: "approval not found" }, { status: 404 });
  }

  const approval = resolveApproval(id, "approved", {
    resolved_by: "user",
    notes: typeof body.notes === "string" ? body.notes : null,
  });
  if (!approval) {
    return Response.json({ error: "approval not found" }, { status: 404 });
  }

  // Only insert the notification on the *transition* from pending → approved.
  // resolveApproval is idempotent (returns the existing row if already
  // resolved); we use the previous status to decide.
  if (existing.status === "pending") {
    try {
      insertNotification({
        sender_id: approval.agent_id,
        recipient_id: "user",
        body: `Approval granted: ${approval.title}`,
        run_id: approval.run_id ?? null,
        metadata: {
          source: "approval-resolved",
          approval_id: approval.id,
          status: "approved",
        },
      });
    } catch {
      // best-effort — never fail the resolve over a notification hiccup
    }
  }

  return Response.json({ approval });
}
