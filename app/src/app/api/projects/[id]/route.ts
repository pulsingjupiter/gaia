/**
 * GET    /api/projects/[id]   → { project, stats }
 * PATCH  /api/projects/[id]   → { project } (partial update)
 * DELETE /api/projects/[id]   → soft-delete (archived=1)
 */
import {
  archiveProject,
  getProject,
  getProjectStats,
  updateProject,
  type UpdateProjectPatch,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

function notFound(): Response {
  return Response.json({ error: "project not found" }, { status: 404 });
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) return notFound();
  const stats = getProjectStats(id);
  return Response.json({ project, stats });
}

const ALLOWED_PATCH_KEYS: ReadonlyArray<keyof UpdateProjectPatch> = [
  "name",
  "path",
  "transcript_dir",
  "color",
  "icon",
  "agent_name",
  "agent_avatar",
  "is_internal",
  "description",
  "brief_markdown",
  "archived",
];

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getProject(id)) return notFound();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const patch: UpdateProjectPatch = {};
  for (const key of ALLOWED_PATCH_KEYS) {
    if (key in body) {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }
  const project = updateProject(id, patch);
  return Response.json({ project });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getProject(id)) return notFound();
  archiveProject(id);
  return Response.json({ ok: true });
}
