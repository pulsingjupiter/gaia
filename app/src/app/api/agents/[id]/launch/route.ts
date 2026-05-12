/**
 * POST /api/agents/[id]/launch
 *   body: {
 *     mode: 'open' | 'continue' | 'copy',
 *     terminal?: 'Terminal' | 'iTerm2',  // default 'Terminal'; ignored when mode='copy'
 *     cwd?: string                       // optional working-dir override
 *   }
 *
 *   - mode='open'     → spawn `osascript` to launch the chosen terminal app
 *                       with `cd <agent_dir> && claude` (new session).
 *   - mode='continue' → spawn `osascript` with `cd <agent_dir> && claude --continue`
 *                       to pick up the most recent session in that cwd.
 *   - mode='copy'     → no side effect; returns { ok, command } so the client
 *                       can copy the continue command to the clipboard.
 *
 *   - cwd override (Overview tab — "Launch agent here"): when supplied the
 *     command `cd`s into that directory instead of the agent's own
 *     agent_dir. The path is validated to exist on disk before we pass it
 *     to the AppleScript builder; this keeps the agent persona (CLAUDE.md
 *     etc.) accessible only because Claude Code walks the directory tree
 *     for context, but pins the session to the project root so its file
 *     edits land there.
 *
 * The user drives the terminal interactively, so we deliberately do NOT
 * pass `--dangerously-skip-permissions` here — normal permission prompts
 * are expected.
 *
 * Mirrors the AppleScript helpers in /api/sessions/[id]/resume but is keyed
 * by employee/agent rather than session.
 *
 * Multi-runtime MVP: when the employee's `runtime` is 'jules', 'codex', or
 * 'gemini' the command becomes a `cd <agent_dir>` followed by a comment
 * hint pointing at the relevant executor. We never attempt to spawn the
 * executor itself — the user runs `jules` / `codex` / `gemini`
 * interactively. The `continue` mode is meaningless for non-Claude
 * runtimes (no resumable JSONL session), so we collapse it to the same
 * open-shell behaviour.
 */
import { statSync } from "node:fs";

import { getEmployee, type EmployeeRuntime } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import {
  ITERM_LAUNCH_SCRIPT,
  TERMINAL_LAUNCH_SCRIPT,
  runOsascript,
  shellEscape,
} from "@/server/osascript.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const VALID_MODES = new Set(["open", "continue", "copy"]);
const VALID_TERMS = new Set(["Terminal", "iTerm2"]);

function buildCommand(
  agentDir: string,
  mode: "open" | "continue" | "copy",
  rt: EmployeeRuntime,
): string {
  const cd = `cd ${shellEscape(agentDir)}`;
  if (rt === "jules") {
    // The Jules CLI runs interactively. We just drop the user into the
    // agent dir with a one-line reminder of how to start a task. The
    // shell history shows the hint so it's discoverable later.
    return `${cd} && echo '# Jules executor — run \`jules\` to start a task. Docs: https://jules.google'`;
  }
  if (rt === "codex") {
    return `${cd} && echo '# Codex executor — run \`codex\` to start a task. Docs: https://github.com/openai/codex'`;
  }
  if (rt === "gemini") {
    return `${cd} && echo '# Gemini executor — run \`gemini\` to start a session. Docs: https://github.com/google-gemini/gemini-cli'`;
  }
  const base = `${cd} && claude`;
  if (mode === "open") return base;
  // Both 'continue' and 'copy' use the --continue form so the copied snippet
  // resumes the most recent session in cwd. (Verified via `claude --help`:
  // `-c, --continue` continues the most recent conversation in the current
  // directory.)
  return `${base} --continue`;
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;

  if (id === "system") {
    return Response.json(
      { error: "system pseudo-agent has no real agent_dir" },
      { status: 404 },
    );
  }

  const employee = getEmployee(id);
  if (!employee) {
    return Response.json({ error: "employee not found" }, { status: 404 });
  }
  if (!employee.agent_dir) {
    return Response.json(
      { error: "employee has no agent_dir" },
      { status: 404 },
    );
  }

  let body: { mode?: string; terminal?: string; cwd?: string } = {};
  try {
    body = (await req.json()) as {
      mode?: string;
      terminal?: string;
      cwd?: string;
    };
  } catch {
    // empty body OK — we'll fail validation below
  }

  const mode = body.mode ?? "";
  if (!VALID_MODES.has(mode)) {
    return Response.json(
      { error: "mode must be one of: open|continue|copy" },
      { status: 400 },
    );
  }

  let workingDir = employee.agent_dir;
  if (typeof body.cwd === "string" && body.cwd.trim()) {
    const override = body.cwd.trim();
    try {
      const st = statSync(override);
      if (!st.isDirectory()) {
        return Response.json(
          { error: "cwd is not a directory" },
          { status: 400 },
        );
      }
    } catch {
      return Response.json(
        { error: "cwd does not exist on disk" },
        { status: 400 },
      );
    }
    workingDir = override;
  }

  const employeeRuntime: EmployeeRuntime =
    employee.runtime === "jules" ||
    employee.runtime === "codex" ||
    employee.runtime === "gemini"
      ? employee.runtime
      : "claude";
  const command = buildCommand(
    workingDir,
    mode as "open" | "continue" | "copy",
    employeeRuntime,
  );

  if (mode === "copy") {
    return Response.json({ ok: true, command });
  }

  const terminal = body.terminal ?? "Terminal";
  if (!VALID_TERMS.has(terminal)) {
    return Response.json(
      { error: "terminal must be Terminal|iTerm2" },
      { status: 400 },
    );
  }

  const script =
    terminal === "iTerm2"
      ? ITERM_LAUNCH_SCRIPT(command)
      : TERMINAL_LAUNCH_SCRIPT(command);

  const result = await runOsascript(script);
  if (!result.ok) {
    return Response.json(
      { error: result.stderr || "osascript failed", command },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, command });
}
