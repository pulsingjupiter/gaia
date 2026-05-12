/**
 * GET  /api/projects?include_archived=&search=  → { projects: ProjectRow[] }
 * POST /api/projects                            → 201 { project }
 *
 * Wave 1 — Claude Code orchestrator. Projects are auto-discovered by the
 * watcher; this route exists for manual create/list.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import path from "node:path";
import fs from "node:fs";
import type { NextRequest } from "next/server";

import {
  detectRepoUrl,
  listProjects,
  parseRepoUrl,
  upsertProject,
  type ProjectFilters,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { pickProjectColor } from "@/server/session-watcher.ts";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const filters: ProjectFilters = {};
  if (sp.get("include_archived") === "1") filters.include_archived = true;
  const search = sp.get("search");
  if (search) filters.search = search;
  // Hide auto-discovered agent / temp dirs from the user-facing list by
  // default. Power users can pass ?include_internal=1 to see everything.
  if (sp.get("include_internal") !== "1") {
    filters.is_internal = false;
  }
  const projects = listProjects(filters);
  return Response.json({ projects });
}

type CreateBody = {
  name?: unknown;
  path?: unknown;
  color?: unknown;
  icon?: unknown;
  agent_name?: unknown;
  agent_avatar?: unknown;
  description?: unknown;
  repo_url?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function sanitisedTranscriptDir(absPath: string): string {
  // Mirror Claude CLI rule: leading `/`, then `/` → `-`. Net: leading `-`.
  return absPath.replace(/\//g, "-");
}

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");

  const name = asString(body.name)?.trim();
  const dirPath = asString(body.path)?.trim();
  if (!name) return badRequest("name (string) required");
  if (!dirPath || !path.isAbsolute(dirPath)) {
    return badRequest("path (absolute string) required");
  }

  if (!fs.existsSync(dirPath)) {
    return badRequest(`path does not exist: ${dirPath}`);
  }

  const transcript_dir = sanitisedTranscriptDir(dirPath);
  const color = asString(body.color) ?? pickProjectColor(dirPath);
  let repoUrl: string | null = null;
  if ("repo_url" in body && body.repo_url != null) {
    const parsed = parseRepoUrl(asString(body.repo_url));
    if (!parsed) return badRequest("repo_url must be a valid repository URL");
    repoUrl = parsed.url;
  } else if (!("repo_url" in body) && fs.existsSync(path.join(dirPath, ".git"))) {
    repoUrl = await detectRepoUrl(dirPath);
  }
  const project = upsertProject({
    name,
    path: dirPath,
    transcript_dir,
    color,
    icon: asString(body.icon) ?? null,
    agent_name: asString(body.agent_name) ?? null,
    agent_avatar: asString(body.agent_avatar) ?? null,
    description: asString(body.description) ?? null,
    repo_url: repoUrl,
  });
  return Response.json({ project }, { status: 201 });
}
