/**
 * POST /api/sessions/[id]/prompt
 *   body: { prompt: string }
 *
 * Spawns the Claude CLI in headless resume mode at the project's cwd. The
 * watcher will pick up the appended transcript lines automatically. Returns
 * immediately after the process is spawned (does not wait for completion).
 */
import { spawn } from "node:child_process";

import { getProject, getSession } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const CLAUDE_BIN = "/Users/adrian/.local/bin/claude";

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  const project = getProject(session.project_id);
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 500 });
  }

  let body: { prompt?: unknown };
  try {
    body = (await req.json()) as { prompt?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json(
      { error: "prompt (non-empty string) required" },
      { status: 400 },
    );
  }

  const args = [
    "-p",
    prompt,
    "--resume",
    session.id,
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];

  let child;
  try {
    child = spawn(CLAUDE_BIN, args, {
      cwd: project.path,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to spawn claude: ${msg}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, prompt_sent: true, pid: child.pid });
}
