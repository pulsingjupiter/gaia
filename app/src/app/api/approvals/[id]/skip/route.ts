/**
 * POST /api/approvals/[id]/skip  body { notes? }
 *   → { approval: ApprovalRow }
 *
 * Marks the approval as skipped + drops a notification into the agent's
 * thread so the rejection is visible in the chat panel.
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

  const approval = resolveApproval(id, "skipped", {
    resolved_by: "user",
    notes: typeof body.notes === "string" ? body.notes : null,
  });
  if (!approval) {
    return Response.json({ error: "approval not found" }, { status: 404 });
  }

  if (existing.status === "pending") {
    try {
      insertNotification({
        sender_id: approval.agent_id,
        recipient_id: "user",
        body: `Skipped: ${approval.title}`,
        run_id: approval.run_id ?? null,
        metadata: {
          source: "approval-resolved",
          approval_id: approval.id,
          status: "skipped",
        },
      });
    } catch {
      // best-effort
    }
  }

  return Response.json({ approval });
}
