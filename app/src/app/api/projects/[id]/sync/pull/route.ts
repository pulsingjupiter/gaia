/**
 * POST /api/projects/[id]/sync/pull
 *
 * git pull --ff-only on the project's path, then re-import .gaia/* → DB.
 * Requires project.collaborative === 1. Returns merge-conflict output
 * verbatim on failure so the user can resolve in their editor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getProject } from "@/server/db";
import { importProjectFromFiles } from "@/server/project-files";

const execFileAsync = promisify(execFile);

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ ok: false, error: "project not found" }, { status: 404 });
  }
  if (project.collaborative !== 1) {
    return Response.json(
      { ok: false, error: "project is not collaborative" },
      { status: 400 },
    );
  }
  if (!project.path) {
    return Response.json({ ok: false, error: "project has no path" }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-C", project.path, "pull", "--ff-only"],
      { encoding: "utf8" },
    );
    // Reconcile DB from any newly pulled .gaia/* files.
    await importProjectFromFiles(id);
    return Response.json({ ok: true, output: stdout + (stderr ? "\n" + stderr : "") });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    return Response.json(
      { ok: false, error: output || e.message || "git pull failed" },
      { status: 500 },
    );
  }
}
