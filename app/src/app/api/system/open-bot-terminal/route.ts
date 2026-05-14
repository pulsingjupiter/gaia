/**
 * POST /api/system/open-bot-terminal
 *
 * Opens Terminal.app with the command to start the bot.
 */
import { PATHS } from "@/server/db.ts";
import {
  TERMINAL_LAUNCH_SCRIPT,
  runOsascript,
  shellEscape,
} from "@/server/osascript.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const command = `cd ${shellEscape(PATHS.appRoot)} && npm run bot`;
  const script = TERMINAL_LAUNCH_SCRIPT(command);

  const result = await runOsascript(script);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "osascript failed" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
