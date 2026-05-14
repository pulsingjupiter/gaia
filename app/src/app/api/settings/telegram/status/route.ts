/**
 * GET /api/settings/telegram/status
 *
 * Checks if the Telegram bot process is running.
 */
import { execFileSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const pids = execFileSync("pgrep", ["-f", "telegram-bot.ts"], {
      encoding: "utf8",
    });
    const pid = parseInt(pids.trim().split("\n")[0], 10);
    if (pid > 0) {
      return Response.json({ running: true, pid });
    }
  } catch (error) {
    // pgrep exits with 1 if no process is found, which is not an error for us.
    // Any other error will be caught here too.
  }
  return Response.json({ running: false });
}
