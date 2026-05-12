/**
 * POST /api/projects/scan
 *   body: { baseDir?: string, maxDepth?: number }
 *
 * Walks `baseDir` (default `~/Developer`) up to `maxDepth` (default 3) levels
 * deep and registers every git repo it finds as a project. Already-registered
 * paths and hidden / node_modules dirs are skipped, and we don't descend into
 * a repo once detected.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  detectRepoUrl,
  listProjects,
  upsertProject,
  type ProjectRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { pickProjectColor } from "@/server/session-watcher.ts";

type ScanBody = {
  baseDir?: unknown;
  maxDepth?: unknown;
};

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function sanitisedTranscriptDir(absPath: string): string {
  return absPath.replace(/\//g, "-");
}

const SKIP_DIRS = new Set(["node_modules"]);

function walk(
  baseDir: string,
  maxDepth: number,
  knownPaths: Set<string>,
): { repos: string[]; scanned: number } {
  const repos: string[] = [];
  let scanned = 0;
  const stack: { dir: string; depth: number }[] = [
    { dir: baseDir, depth: 0 },
  ];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    scanned += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    // Detect git repo at this dir.
    const isRepo = entries.some(
      (e) => e.name === ".git" && (e.isDirectory() || e.isFile()),
    );
    if (isRepo) {
      if (!knownPaths.has(dir)) repos.push(dir);
      continue; // don't descend into a repo
    }
    if (depth >= maxDepth) continue;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
    }
  }
  return { repos, scanned };
}

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: ScanBody;
  try {
    body = (await request.json().catch(() => ({}))) as ScanBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  const baseDirRaw =
    typeof body.baseDir === "string" && body.baseDir.trim()
      ? body.baseDir.trim()
      : path.join(os.homedir(), "Developer");
  if (!path.isAbsolute(baseDirRaw)) {
    return badRequest("baseDir must be an absolute path");
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(baseDirRaw);
  } catch {
    return badRequest(`baseDir does not exist: ${baseDirRaw}`);
  }
  if (!stat.isDirectory()) {
    return badRequest(`baseDir is not a directory: ${baseDirRaw}`);
  }

  const maxDepthNum =
    typeof body.maxDepth === "number" && Number.isFinite(body.maxDepth)
      ? Math.max(1, Math.min(8, Math.floor(body.maxDepth)))
      : 3;

  const existing = listProjects({ include_archived: true });
  const known = new Set(existing.map((p) => p.path));

  const { repos, scanned } = walk(baseDirRaw, maxDepthNum, known);

  const added: ProjectRow[] = [];
  for (const repo of repos) {
    const repoUrl = await detectRepoUrl(repo);
    const project = upsertProject({
      name: path.basename(repo),
      path: repo,
      transcript_dir: sanitisedTranscriptDir(repo),
      color: pickProjectColor(repo),
      repo_url: repoUrl,
    });
    added.push(project);
  }

  return Response.json({
    scanned,
    added: added.length,
    skipped: repos.length - added.length,
    baseDir: baseDirRaw,
    projects: added,
  });
}
