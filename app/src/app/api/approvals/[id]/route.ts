/**
 * PATCH /api/approvals/[id]  body { status: 'approved' | 'rejected', notes? }
 *   → { approval: ApprovalRow }
 *
 * Unified endpoint for resolving approvals. Maps 'rejected' -> 'skipped'
 * for DB compatibility.
 */
import {
  getApproval,
  insertNotification,
  resolveApproval,
  type ApprovalStatus,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  status: "approved" | "rejected";
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    return Response.json(
      { error: "status must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  const existing = getApproval(id);
  if (!existing) {
    return Response.json({ error: "approval not found" }, { status: 404 });
  }

  // Map 'rejected' -> 'skipped' for DB
  const dbStatus: "approved" | "skipped" =
    body.status === "rejected" ? "skipped" : "approved";

  const approval = resolveApproval(id, dbStatus, {
    resolved_by: "user",
    notes: typeof body.notes === "string" ? body.notes : null,
  });

  if (!approval) {
    return Response.json({ error: "approval not found" }, { status: 404 });
  }

  if (existing.status === "pending") {
    try {
      const verb = dbStatus === "approved" ? "Approval granted" : "Skipped";
      insertNotification({
        sender_id: approval.agent_id,
        recipient_id: "user",
        body: `${verb}: ${approval.title}`,
        run_id: approval.run_id ?? null,
        metadata: {
          source: "approval-resolved",
          approval_id: approval.id,
          status: dbStatus,
        },
      });
    } catch {
      // best-effort
    }
  }

  return Response.json({ approval });
}
