/**
 * GET    /api/milestones/[id]    → { milestone }
 * PATCH  /api/milestones/[id]    → { milestone } (partial update)
 * DELETE /api/milestones/[id]    → { ok: true }
 *
 * Hard-delete intentionally does NOT cascade to tasks. `deleteMilestone`
 * nulls out `milestone_id` on every task that pointed at this row so the
 * work survives. Use `PATCH { status: 'archived' }` for soft-delete.
 */
import {
  deleteMilestone,
  getMilestone,
  updateMilestone,
  type MilestoneStatus,
  type UpdateMilestonePatch,
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

function notFound(id: string): Response {
  return Response.json({ error: `milestone '${id}' not found` }, { status: 404 });
}

function parseDateInput(v: unknown): number | null | "__bad__" {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const d = new Date(trimmed);
    if (Number.isFinite(d.getTime())) return d.getTime();
  }
  return "__bad__";
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const milestone = getMilestone(id);
  if (!milestone) return notFound(id);
  return Response.json({ milestone });
}

type PatchBody = {
  name?: unknown;
  description?: unknown;
  due_date?: unknown;
  status?: unknown;
  sort_order?: unknown;
};

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getMilestone(id)) return notFound(id);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest("body must be an object");
  }

  const patch: UpdateMilestonePatch = {};

  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return badRequest("name must be a non-empty string");
    }
    patch.name = body.name.trim();
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return badRequest("description must be string|null");
    }
    patch.description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  }
  if ("due_date" in body) {
    const parsed = parseDateInput(body.due_date);
    if (parsed === "__bad__") return badRequest("due_date must be number|string|null");
    patch.due_date = parsed;
  }
  if ("status" in body) {
    if (
      typeof body.status !== "string" ||
      !VALID_STATUSES.includes(body.status as MilestoneStatus)
    ) {
      return badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    patch.status = body.status as MilestoneStatus;
  }
  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return badRequest("sort_order must be number");
    }
    patch.sort_order = Math.trunc(body.sort_order);
  }

  const milestone = updateMilestone(id, patch);
  if (!milestone) return notFound(id);
  return Response.json({ milestone });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getMilestone(id)) return notFound(id);
  const ok = deleteMilestone(id);
  if (!ok) return notFound(id);
  return Response.json({ ok: true });
}
