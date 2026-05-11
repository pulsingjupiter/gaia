/**
 * POST /api/agents/[id]/launch
 *   body: {
 *     mode: 'open' | 'continue' | 'copy',
 *     terminal?: 'Terminal' | 'iTerm2'   // default 'Terminal'; ignored when mode='copy'
 *   }
 *
 *   - mode='open'     → spawn `osascript` to launch the chosen terminal app
 *                       with `cd <agent_dir> && claude` (new session).
 *   - mode='continue' → spawn `osascript` with `cd <agent_dir> && claude --continue`
 *                       to pick up the most recent session in that cwd.
 *   - mode='copy'     → no side effect; returns { ok, command } so the client
 *                       can copy the continue command to the clipboard.
 *
 * Adrian wants to drive the terminal interactively, so we deliberately do
 * NOT pass `--dangerously-skip-permissions` here — normal permission prompts
 * are expected.
 *
 * Mirrors the AppleScript helpers in /api/sessions/[id]/resume but is keyed
 * by employee/agent rather than session.
 */
import { getEmployee } from "@/server/db.ts";
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

function buildCommand(agentDir: string, mode: "open" | "continue" | "copy"): string {
  const base = `cd ${shellEscape(agentDir)} && claude`;
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

  let body: { mode?: string; terminal?: string } = {};
  try {
    body = (await req.json()) as { mode?: string; terminal?: string };
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

  const command = buildCommand(employee.agent_dir, mode as "open" | "continue" | "copy");

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
