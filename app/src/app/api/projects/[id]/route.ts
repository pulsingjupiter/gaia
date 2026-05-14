/**
 * GET    /api/projects/[id]   → { project, stats }
 * PATCH  /api/projects/[id]   → { project } (partial update)
 * DELETE /api/projects/[id]   → soft-delete (archived=1)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  archiveProject,
  getProject,
  getProjectStats,
  parseRepoUrl,
  updateProject,
  type UpdateProjectPatch,
} from "@/server/db.ts";
import {
  exportProjectToFiles,
  importProjectFromFiles,
  projectHasGaiaDir,
} from "@/server/project-files.ts";
import { ensureSeeded } from "@/server/seed.ts";

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
  "repo_url",
  "archived",
  "collaborative",
];

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) return notFound();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // If enabling collaborative mode, check for repo_url first.
  if (body.collaborative && !project.repo_url && !body.repo_url) {
    return Response.json(
      { error: "collaborative requires repo_url" },
      { status: 400 },
    );
  }

  const patch: UpdateProjectPatch = {};
  for (const key of ALLOWED_PATCH_KEYS) {
    if (key in body) {
      if (key === "repo_url") {
        const value = body[key];
        if (value === null) {
          patch.repo_url = null;
          continue;
        }
        const parsed = typeof value === "string" ? parseRepoUrl(value) : null;
        if (!parsed) {
          return Response.json(
            { error: "repo_url must be a valid repository URL or null" },
            { status: 400 },
          );
        }
        patch.repo_url = parsed.url;
        continue;
      }
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }
  const updatedProject = updateProject(id, patch);

  // If toggling collaborative from 0 to 1, trigger initial sync.
  const wasCollaborative = project.collaborative === 1;
  const isCollaborative = body.collaborative === true || body.collaborative === 1;
  if (!wasCollaborative && isCollaborative) {
    const hasGaia = await projectHasGaiaDir(id);
    if (hasGaia) {
      await importProjectFromFiles(id);
    } else {
      await exportProjectToFiles(id);
    }
  }

  return Response.json({ project: updatedProject });
}

export async function DELETE(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getProject(id)) return notFound();
  archiveProject(id);
  return Response.json({ ok: true });
}
