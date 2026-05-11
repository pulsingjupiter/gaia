/**
 * POST /api/system/pick-file
 *   body: { initial?: string, prompt?: string, of_type?: string[] }
 *
 * Opens a macOS Finder `choose file` dialog via osascript and returns the
 * selected POSIX path. Mirrors the shape of pick-folder. Cancellation is
 * expected and returns `{ cancelled: true }` with HTTP 200 — only real
 * errors (osascript missing, parse failure, etc.) surface as 5xx.
 *
 * `of_type` defaults to `["public.image"]` — macOS's UTI for any image type.
 */
import fs from "node:fs";

import { appleScriptEscape, runOsascript } from "@/server/osascript.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  initial?: unknown;
  prompt?: unknown;
  of_type?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  }
  return out.length > 0 ? out : undefined;
}

function buildScript(
  initial: string | undefined,
  prompt: string,
  ofType: string[],
): string {
  const promptEsc = appleScriptEscape(prompt);
  const typeList = ofType
    .map((t) => `"${appleScriptEscape(t)}"`)
    .join(", ");
  let chooseExpr = `choose file with prompt "${promptEsc}" of type {${typeList}}`;
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
  const prompt = asString(body.prompt) ?? "Select a file";
  const ofType = asStringArray(body.of_type) ?? ["public.image"];

  const script = buildScript(initial, prompt, ofType);
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
  return Response.json({ path: pickedPath });
}
