/**
 * POST /api/system/pick-folder
 *   body: { initial?: string, prompt?: string }
 *
 * Opens a macOS Finder `choose folder` dialog via osascript and returns the
 * selected POSIX path. Cancellation is expected and returns `{ cancelled: true }`
 * with HTTP 200 — only real errors (osascript missing, parse failure, etc.)
 * surface as 5xx.
 */
import fs from "node:fs";

import { appleScriptEscape, runOsascript } from "@/server/osascript.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  initial?: unknown;
  prompt?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function buildScript(initial: string | undefined, prompt: string): string {
  const promptEsc = appleScriptEscape(prompt);
  let chooseExpr = `choose folder with prompt "${promptEsc}"`;
  if (initial) {
    let exists = false;
    try {
      exists = fs.statSync(initial).isDirectory();
    } catch {
      exists = false;
    }
    if (exists) {
      chooseExpr += ` default location (POSIX file "${appleScriptEscape(initial)}")`;
    }
  }
  return `
tell application "System Events"
  activate
  set f to ${chooseExpr}
  return POSIX path of f
end tell
`;
}

export async function POST(request: Request): Promise<Response> {
  let body: Body = {};
  try {
    body = (await request.json().catch(() => ({}))) as Body;
  } catch {
    // empty body OK
  }

  const initial = asString(body.initial);
  const prompt = asString(body.prompt) ?? "Select project folder";

  const script = buildScript(initial, prompt);
  const result = await runOsascript(script);
  if (!result.ok) {
    // osascript returns non-zero with "User canceled." (-128) when the user
    // cancels — this is expected, not an error.
    if (/User canceled|-128/i.test(result.stderr)) {
      return Response.json({ cancelled: true });
    }
    return Response.json(
      { error: result.stderr || "osascript failed" },
      { status: 500 },
    );
  }

  const pickedPath = result.stdout.trim();
  if (!pickedPath) {
    return Response.json({ cancelled: true });
  }
  // osascript appends a trailing slash for folders — strip it for cleanliness.
  const normalised = pickedPath.replace(/\/$/, "");
  return Response.json({ path: normalised });
}
