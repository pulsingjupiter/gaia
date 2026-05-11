/**
 * POST /api/system/open-terminal
 *   body: { check: string, terminal?: 'Terminal' | 'iTerm2' }
 *
 * Opens a macOS terminal that runs the remediation command for a given
 * failed system check (see /api/system-check for the check shape). Each
 * supported check name maps to a single shell command — anything else is
 * rejected with 400.
 */
import { PATHS } from "@/server/db.ts";
import {
  ITERM_LAUNCH_SCRIPT,
  TERMINAL_LAUNCH_SCRIPT,
  runOsascript,
  shellEscape,
} from "@/server/osascript.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TERMS = new Set(["Terminal", "iTerm2"]);

function commandFor(check: string): string | null {
  switch (check) {
    case "agents_scaffolded":
      return `cd ${shellEscape(PATHS.projectRoot)} && ./setup.sh`;
    case "data_dir_writable":
      return `chmod -R u+w ${shellEscape(PATHS.dataDir)}`;
    case "claude_cli_available":
      return `npm install -g @anthropic-ai/claude-code`;
    default:
      return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { check?: string; terminal?: string } = {};
  try {
    body = (await req.json()) as { check?: string; terminal?: string };
  } catch {
    // empty body OK — we'll fail validation below
  }

  const check = body.check ?? "";
  const command = commandFor(check);
  if (!command) {
    return Response.json(
      { error: `no terminal command for check ${check || "(missing)"}` },
      { status: 400 },
    );
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
