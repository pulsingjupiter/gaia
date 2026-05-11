/**
 * POST /api/sessions/[id]/resume
 *   body: { terminal?: 'Terminal' | 'iTerm2' | 'copy' }
 *   default terminal = 'Terminal'
 *
 *   - terminal=copy → returns { command } (no side effect)
 *   - else          → spawns osascript to open the terminal app with the
 *                     resume command pre-typed.
 */
import { spawn } from "node:child_process";

import { getProject, getSession } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const VALID_TERMS = new Set(["Terminal", "iTerm2", "copy"]);

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function appleScriptEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const TERMINAL_RESUME_SCRIPT = (cwd: string, sessionId: string) => `
tell application "Terminal"
  activate
  do script "cd ${appleScriptEscape(shellEscape(cwd))} && claude --resume ${appleScriptEscape(sessionId)}"
end tell
`;

const ITERM_RESUME_SCRIPT = (cwd: string, sessionId: string) => `
tell application "iTerm2"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "cd ${appleScriptEscape(shellEscape(cwd))} && claude --resume ${appleScriptEscape(sessionId)}"
  end tell
end tell
`;

function runOsascript(
  script: string,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script]);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      resolve({ ok: false, stderr: stderr || String(err) });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stderr });
    });
  });
}

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

  let body: { terminal?: string } = {};
  try {
    body = (await req.json()) as { terminal?: string };
  } catch {
    // empty body OK
  }
  const terminal = body.terminal ?? "Terminal";
  if (!VALID_TERMS.has(terminal)) {
    return Response.json(
      { error: "terminal must be Terminal|iTerm2|copy" },
      { status: 400 },
    );
  }

  const command = `cd ${shellEscape(project.path)} && claude --resume ${session.id}`;

  if (terminal === "copy") {
    return Response.json({ command });
  }

  const script =
    terminal === "iTerm2"
      ? ITERM_RESUME_SCRIPT(project.path, session.id)
      : TERMINAL_RESUME_SCRIPT(project.path, session.id);

  const result = await runOsascript(script);
  if (!result.ok) {
    return Response.json(
      { error: result.stderr || "osascript failed", command },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, command });
}
