/**
 * GET  /api/projects/[id]/milestones?status=&search=
 *      → { milestones: MilestoneRow[] }
 *
 * POST /api/projects/[id]/milestones
 *      body: { name, description?, due_date?, status?, sort_order? }
 *      → 201 { milestone }
 *
 * Project-scoped milestone CRUD. The path id is the source of truth for the
 * milestone's `project_id` — request bodies that pass a conflicting
 * `project_id` are ignored. Date inputs accept either ms-epoch numbers or
 * ISO date strings ("YYYY-MM-DD"), which we parse to local-midnight ms.
 */
import type { NextRequest } from "next/server";

import {
  getProject,
  insertMilestone,
  listMilestones,
  type MilestoneStatus,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const VALID_STATUSES: readonly MilestoneStatus[] = [
  "active",
  "complete",
  "archived",
];

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function notFound(): Response {
  return Response.json({ error: "project not found" }, { status: 404 });
}

function parseDateInput(v: unknown): number | null | "__bad__" {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    // Accept "YYYY-MM-DD" → local midnight, or any Date-parseable string.
    const d = new Date(trimmed);
    if (Number.isFinite(d.getTime())) return d.getTime();
  }
  return "__bad__";
}

export async function GET(
  request: NextRequest,
  ctx: RouteCtx,
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getProject(id)) return notFound();
  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const search = sp.get("search") ?? undefined;
  let status: MilestoneStatus | undefined;
  if (statusRaw) {
    if (!VALID_STATUSES.includes(statusRaw as MilestoneStatus)) {
      return badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    status = statusRaw as MilestoneStatus;
  }
  const milestones = listMilestones({
    project_id: id,
    status,
    search,
  });
  return Response.json({ milestones });
}

type CreateBody = {
  name?: unknown;
  description?: unknown;
  due_date?: unknown;
  status?: unknown;
  sort_order?: unknown;
};

export async function POST(
  request: Request,
  ctx: RouteCtx,
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getProject(id)) return notFound();

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");

  if (typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("name (non-empty string) required");
  }
  const description =
    body.description === undefined || body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : "__bad__";
  if (description === "__bad__") {
    return badRequest("description must be string|null");
  }
  const due_date = parseDateInput(body.due_date);
  if (due_date === "__bad__") return badRequest("due_date must be number|string|null");

  let status: MilestoneStatus = "active";
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !VALID_STATUSES.includes(body.status as MilestoneStatus)
    ) {
      return badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    status = body.status as MilestoneStatus;
  }

  let sort_order = 0;
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return badRequest("sort_order must be number");
    }
    sort_order = Math.trunc(body.sort_order);
  }

  const milestone = insertMilestone({
    project_id: id,
    name: body.name.trim(),
    description,
    due_date,
    status,
    sort_order,
  });
  return Response.json({ milestone }, { status: 201 });
}
