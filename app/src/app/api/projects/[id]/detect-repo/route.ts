export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { detectRepoUrl, getProject } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }
  const url = await detectRepoUrl(project.path);
  return Response.json({ url });
}
