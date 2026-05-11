/**
 * GET /api/tasks/summary?project_id=
 *     → { summary: TaskDueSummary }
 *
 * Aggregate counts for the Tasks widgets (Overview rail, project header
 * status strip, sidebar badge). Scoped to a project when `project_id` is
 * passed, otherwise global.
 */
import type { NextRequest } from "next/server";

import { getTaskDueSummary } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const project_id = request.nextUrl.searchParams.get("project_id");
  const summary = getTaskDueSummary(
    project_id ? { project_id } : undefined,
  );
  return Response.json({ summary });
}
