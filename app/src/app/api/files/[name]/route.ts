/**
 * GET /api/files/[name]?preview=1
 *      preview=1 + text/markdown → JSON { name, content_text, mime_type, size, preview_kind }
 *      otherwise                  → binary stream with Content-Disposition: attachment
 *
 * DELETE /api/files/[name] → { ok: true }
 *
 * Path-traversal hardened: the `name` segment is rejected if it contains '/',
 * '\', '..', or starts with '.'.
 *
 * Wave 1.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

import { ensureSeeded } from "@/server/seed.ts";
import { SHARED_FILES_DIR, classifyFile } from "../route.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSafeName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.startsWith(".")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (name.length > 255) return false;
  return true;
}

function notFound(name: string): Response {
  return Response.json({ error: `file '${name}' not found` }, { status: 404 });
}

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
  ensureSeeded();
  const raw = (await ctx.params).name;
  const name = decodeURIComponent(raw);
  if (!isSafeName(name)) return badRequest("invalid file name");

  const full = path.join(SHARED_FILES_DIR, name);
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(full);
  } catch {
    return notFound(name);
  }
  if (!stat.isFile()) return notFound(name);

  const cls = classifyFile(name);
  const wantsPreview = request.nextUrl.searchParams.get("preview") === "1";

  if (wantsPreview && (cls.preview_kind === "markdown" || cls.preview_kind === "text")) {
    const content_text = await fs.readFile(full, "utf8");
    return Response.json({
      name,
      content_text,
      mime_type: cls.mime_type,
      size: stat.size,
      preview_kind: cls.preview_kind,
      modified_at: stat.mtimeMs,
    });
  }

  // Stream the bytes back. Use Web Streams from the Node Readable.
  const nodeStream = createReadStream(full);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": cls.mime_type,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ name: string }> },
): Promise<Response> {
  ensureSeeded();
  const raw = (await ctx.params).name;
  const name = decodeURIComponent(raw);
  if (!isSafeName(name)) return badRequest("invalid file name");

  const full = path.join(SHARED_FILES_DIR, name);
  try {
    await fs.unlink(full);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return notFound(name);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
  return Response.json({ ok: true });
}
