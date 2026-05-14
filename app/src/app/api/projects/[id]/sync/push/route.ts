/**
 * POST /api/projects/[id]/sync/push
 *
 * Export current DB state to .gaia/* files, stage only .gaia/, commit if
 * anything changed, push. Returns { ok: true, no_changes: true } when
 * there's nothing to commit. Requires project.collaborative === 1.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getProject } from "@/server/db";
import { exportProjectToFiles } from "@/server/project-files";

const execFileAsync = promisify(execFile);

type RouteCtx = { params: Promise<{ id: string }> };

async function gitRun(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

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
    // Ensure files are in sync with the DB before staging.
    await exportProjectToFiles(id);

    await gitRun(project.path, ["add", ".gaia"]);

    // diff --cached --quiet exits 0 when nothing is staged, 1 when there are
    // staged changes. Anything else is a real error.
    try {
      await gitRun(project.path, ["diff", "--cached", "--quiet", "--exit-code"]);
      return Response.json({ ok: true, no_changes: true });
    } catch (diffErr) {
      const e = diffErr as { code?: number };
      if (e.code !== 1) throw diffErr;
    }

    await gitRun(project.path, ["commit", "-m", "Gaia: sync project state"]);
    const { stdout, stderr } = await gitRun(project.path, ["push"]);
    return Response.json({
      ok: true,
      committed: true,
      output: (stdout + (stderr ? "\n" + stderr : "")).trim(),
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    return Response.json(
      { ok: false, error: output || e.message || "git push failed" },
      { status: 500 },
    );
  }
}
