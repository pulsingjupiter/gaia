/**
 * GET  /api/approvals?status=pending&agent_id=&limit=50
 *   → { approvals: ApprovalRow[] }
 *
 * POST /api/approvals  body { agent_id, run_id?, action_type, title, body?, payload? }
 *   → { approval: ApprovalRow } 201
 *
 * Approvals are agent-requested actions awaiting human sign-off. The pending
 * queue feeds into the inbox surface; resolved rows stay in history.
 */
import type { NextRequest } from "next/server";

import {
  getEmployee,
  insertApproval,
  listApprovals,
  type ApprovalStatus,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: ApprovalStatus[] = ["pending", "approved", "skipped"];

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const agent_id = sp.get("agent_id") ?? undefined;
  const limitRaw = sp.get("limit");

  let status: ApprovalStatus | undefined;
  if (statusRaw) {
    if (!VALID_STATUSES.includes(statusRaw as ApprovalStatus)) {
      return badRequest(
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }
    status = statusRaw as ApprovalStatus;
  }

  let limit = 50;
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return badRequest("limit must be positive");
    }
    limit = Math.min(500, Math.floor(n));
  }

  const approvals = listApprovals({
    status,
    agent_id: agent_id || undefined,
    limit,
  });
  return Response.json({ approvals });
}

type CreateBody = {
  agent_id?: string;
  run_id?: string | null;
  action_type?: string;
  title?: string;
  body?: string | null;
  payload?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let payload: CreateBody;
  try {
    payload = (await request.json()) as CreateBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!payload || typeof payload !== "object") {
    return badRequest("body must be object");
  }
  if (typeof payload.agent_id !== "string" || !payload.agent_id.trim()) {
    return badRequest("agent_id (string) required");
  }
  if (typeof payload.action_type !== "string" || !payload.action_type.trim()) {
    return badRequest("action_type (string) required");
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    return badRequest("title (string) required");
  }

  const agent_id = payload.agent_id.trim();
  if (!getEmployee(agent_id)) {
    return Response.json({ error: `unknown agent_id: ${agent_id}` }, { status: 404 });
  }

  const approval = insertApproval({
    agent_id,
    run_id: payload.run_id ?? null,
    action_type: payload.action_type.trim(),
    title: payload.title.trim(),
    body: typeof payload.body === "string" ? payload.body : null,
    payload: payload.payload ?? null,
  });

  return Response.json({ approval }, { status: 201 });
}
