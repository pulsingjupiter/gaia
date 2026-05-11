/**
 * GET /api/sessions?project_id=&status=&limit=50  → { sessions: SessionRow[] }
 */
import type { NextRequest } from "next/server";

import {
  listSessions,
  type SessionFilters,
  type SessionStatus,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "active",
  "idle",
  "ended",
]);

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const filters: SessionFilters = {};
  const project_id = sp.get("project_id");
  if (project_id) filters.project_id = project_id;
  const status = sp.get("status");
  if (status) {
    if (!VALID_STATUSES.has(status as SessionStatus)) {
      return Response.json(
        { error: "status must be active|idle|ended" },
        { status: 400 },
      );
    }
    filters.status = status as SessionStatus;
  }
  const limitRaw = sp.get("limit");
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return Response.json({ error: "limit must be positive number" }, { status: 400 });
    }
    filters.limit = Math.min(500, Math.max(1, Math.floor(n)));
  } else {
    filters.limit = 50;
  }
  const sessions = listSessions(filters);
  return Response.json({ sessions });
}
