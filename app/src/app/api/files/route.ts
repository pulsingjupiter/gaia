/**
 * GET /api/files?owner=
 *     → { files: FileEntry[] }
 *     Lists files in agents/_shared/files/. The `owner` filter is currently
 *     accepted for forward-compatibility but ignored — V1 treats the entire
 *     shared directory as a single bucket.
 *
 * POST /api/files (multipart/form-data, field: `file`)
 *     → { ok: true, file: FileEntry } | { error }
 *     Writes the upload into agents/_shared/files/. Same path-traversal /
 *     name-safety rules as the [name] route, plus a 25MB cap. Refuses to
 *     overwrite an existing file (returns 409) so the user doesn't lose
 *     work to a careless drop.
 *
 * Wave 1 — feeds the Files page in Wave 2.
 */
import path from "node:path";
import fs from "node:fs/promises";
import type { NextRequest } from "next/server";

import { PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function isSafeName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.startsWith(".")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (name.length > 255) return false;
  return true;
}

export type FileEntry = {
  name: string;
  size: number;
  modified_at: number;
  mime_type: string;
  ext: string;
  preview_kind: "text" | "markdown" | "image" | "binary";
};

export const SHARED_FILES_DIR = path.join(PATHS.agentsDir, "_shared", "files");

const MIME_BY_EXT: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  log: "text/plain",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  yml: "application/yaml",
  yaml: "application/yaml",
  toml: "application/toml",
  html: "text/html",
  xml: "application/xml",
  js: "application/javascript",
  ts: "application/typescript",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const TEXT_EXTS = new Set([
  "txt",
  "log",
  "json",
  "csv",
  "tsv",
  "yml",
  "yaml",
  "toml",
  "html",
  "xml",
  "js",
  "ts",
]);
const MARKDOWN_EXTS = new Set(["md", "markdown"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export function classifyFile(name: string): {
  ext: string;
  mime_type: string;
  preview_kind: FileEntry["preview_kind"];
} {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  const mime_type = MIME_BY_EXT[ext] ?? "application/octet-stream";
  let preview_kind: FileEntry["preview_kind"] = "binary";
  if (MARKDOWN_EXTS.has(ext)) preview_kind = "markdown";
  else if (TEXT_EXTS.has(ext)) preview_kind = "text";
  else if (IMAGE_EXTS.has(ext)) preview_kind = "image";
  return { ext, mime_type, preview_kind };
}

export async function GET(_request: NextRequest): Promise<Response> {
  ensureSeeded();
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(SHARED_FILES_DIR, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return Response.json({ files: [] });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }

  const files: FileEntry[] = [];
  for (const d of dirents) {
    if (!d.isFile()) continue;
    if (d.name.startsWith(".")) continue;
    const full = path.join(SHARED_FILES_DIR, d.name);
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    const cls = classifyFile(d.name);
    files.push({
      name: d.name,
      size: stat.size,
      modified_at: stat.mtimeMs,
      mime_type: cls.mime_type,
      ext: cls.ext,
      preview_kind: cls.preview_kind,
    });
  }

  files.sort((a, b) => b.modified_at - a.modified_at);
  return Response.json({ files });
}

export async function POST(request: NextRequest): Promise<Response> {
  ensureSeeded();
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `multipart parse failed: ${msg}` },
      { status: 400 },
    );
  }

  const entry = form.get("file");
  if (!(entry instanceof File)) {
    return Response.json(
      { error: "missing 'file' field in multipart body" },
      { status: 400 },
    );
  }

  // Browsers sometimes send Files with empty names (drag-drop edge cases). We
  // need the original filename to land somewhere on disk.
  const rawName = entry.name?.trim() ?? "";
  if (!rawName) {
    return Response.json(
      { error: "uploaded file has no name" },
      { status: 400 },
    );
  }
  // Strip any path that snuck in from the browser's File.name.
  const baseName = rawName.split(/[\\/]/).pop() ?? "";
  if (!isSafeName(baseName)) {
    return Response.json(
      { error: `invalid file name '${baseName}'` },
      { status: 400 },
    );
  }
  if (entry.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      {
        error: `file too large (${entry.size} bytes; max ${MAX_UPLOAD_BYTES})`,
      },
      { status: 413 },
    );
  }

  await fs.mkdir(SHARED_FILES_DIR, { recursive: true });
  const full = path.join(SHARED_FILES_DIR, baseName);

  // Refuse overwrites — better to surface a conflict than clobber an output
  // file that an agent (or earlier upload) just produced.
  try {
    const existing = await fs.stat(full);
    if (existing.isFile()) {
      return Response.json(
        { error: `file '${baseName}' already exists` },
        { status: 409 },
      );
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const buf = Buffer.from(await entry.arrayBuffer());
    await fs.writeFile(full, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }

  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(full);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
  const cls = classifyFile(baseName);
  const file: FileEntry = {
    name: baseName,
    size: stat.size,
    modified_at: stat.mtimeMs,
    mime_type: cls.mime_type,
    ext: cls.ext,
    preview_kind: cls.preview_kind,
  };
  return Response.json({ ok: true, file }, { status: 201 });
}
