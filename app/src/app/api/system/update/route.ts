/**
 * POST /api/system/update
 *
 * Opens macOS Terminal.app and runs the standard Gaia update sequence:
 *   cd <REPO_ROOT> && git fetch && git pull --ff-only && cd app && npm install
 *
 * Returns `{ ok: true }` on success or `{ ok: false, error }` on osascript
 * failure. No request body required. Mirrors the structure of
 * /api/system/open-terminal so behavior is consistent across the dashboard.
 */
import { PATHS } from "@/server/db";
import {
  ITERM_LAUNCH_SCRIPT,
  TERMINAL_LAUNCH_SCRIPT,
  runOsascript,
  shellEscape,
} from "@/server/osascript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TERMS = new Set(["Terminal", "iTerm2"]);

function buildUpdateCommand(): string {
  // Absolute paths only — the chained `cd app` is harmless if PATHS.appRoot
  // is already absolute (it always is), and we avoid any reliance on the
  // shell's starting cwd.
  const repoRoot = shellEscape(PATHS.projectRoot);
  const appRoot = shellEscape(PATHS.appRoot);
  return `cd ${repoRoot} && git fetch && git pull --ff-only && cd ${appRoot} && npm install`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { terminal?: string } = {};
  try {
    body = (await req.json()) as { terminal?: string };
  } catch {
    // empty body is fine — defaults apply.
  }

  const terminal = body.terminal ?? "Terminal";
  if (!VALID_TERMS.has(terminal)) {
    return Response.json(
      { ok: false, error: "terminal must be Terminal|iTerm2" },
      { status: 400 },
    );
  }

  const command = buildUpdateCommand();
  const script =
    terminal === "iTerm2"
      ? ITERM_LAUNCH_SCRIPT(command)
      : TERMINAL_LAUNCH_SCRIPT(command);

  const result = await runOsascript(script);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "osascript failed", command },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, command });
}
