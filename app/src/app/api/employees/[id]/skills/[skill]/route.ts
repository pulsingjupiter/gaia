/**
 * GET    /api/employees/[id]/skills/[skill] → { skill: SkillDetail }
 * PUT    /api/employees/[id]/skills/[skill] → overwrite SKILL.md body
 * DELETE /api/employees/[id]/skills/[skill] → remove the entire skill folder
 *
 * Per-skill CRUD. The slug ([skill]) is validated against path traversal
 * (no '..', no slashes, must start with alphanumeric). Writes are atomic
 * via tmp file + rename. The 'system' pseudo-agent is read-only — PUT and
 * DELETE 400 for it.
 */
import path from "node:path";
import fs from "node:fs";

import { getEmployee, PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 200;
const MAX_BODY_CHARS = 5000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export type SkillDetail = {
  name: string;
  slug: string;
  path: string;
  body: string;
  preview: string;
  modified_at: number;
};

function validateSlug(slug: string): string | null {
  if (!slug) return "skill slug is required";
  if (slug.length > 80) return "skill slug too long";
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    return "skill slug contains invalid characters";
  }
  if (!SLUG_RE.test(slug)) {
    return "skill slug must be lowercase alphanumeric/hyphen and start with alphanumeric";
  }
  return null;
}

async function resolveSkillPaths(
  id: string,
  rawSlug: string,
): Promise<
  | { error: Response }
  | { skillDir: string; skillFile: string; agentDir: string; slug: string }
> {
  const employee = getEmployee(id);
  if (!employee) {
    return {
      error: Response.json(
        { error: `employee '${id}' not found` },
        { status: 404 },
      ),
    };
  }
  const slugError = validateSlug(rawSlug);
  if (slugError) {
    return { error: Response.json({ error: slugError }, { status: 400 }) };
  }
  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);
  const skillsRoot = path.join(agentDir, ".claude", "skills");
  const skillDir = path.join(skillsRoot, rawSlug);
  // Defence-in-depth — make sure the resolved path is still inside skillsRoot.
  const resolved = path.resolve(skillDir);
  const resolvedRoot = path.resolve(skillsRoot);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return {
      error: Response.json(
        { error: "skill slug resolves outside skills dir" },
        { status: 400 },
      ),
    };
  }
  const skillFile = path.join(skillDir, "SKILL.md");
  return { skillDir, skillFile, agentDir, slug: rawSlug };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; skill: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id, skill: rawSlug } = await ctx.params;
  const resolved = await resolveSkillPaths(id, rawSlug);
  if ("error" in resolved) return resolved.error;
  const { skillFile, slug } = resolved;

  if (!fs.existsSync(skillFile)) {
    return Response.json(
      { error: `skill '${slug}' not found`, path: skillFile },
      { status: 404 },
    );
  }
  let body: string;
  let modified_at = 0;
  try {
    body = fs.readFileSync(skillFile, "utf8");
    modified_at = fs.statSync(skillFile).mtimeMs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to read SKILL.md: ${msg}` },
      { status: 500 },
    );
  }
  const detail: SkillDetail = {
    name: slug,
    slug,
    path: skillFile,
    body,
    preview: body.slice(0, PREVIEW_CHARS),
    modified_at,
  };
  return Response.json({ skill: detail });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string; skill: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id, skill: rawSlug } = await ctx.params;
  if (id === "system") {
    return Response.json(
      { error: "system agent skills are not editable" },
      { status: 400 },
    );
  }
  const resolved = await resolveSkillPaths(id, rawSlug);
  if ("error" in resolved) return resolved.error;
  const { skillDir, skillFile, slug } = resolved;

  let payload: { body?: unknown };
  try {
    payload = (await request.json()) as { body?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const newBody = payload?.body;
  if (typeof newBody !== "string") {
    return Response.json({ error: "body must be a string" }, { status: 400 });
  }
  if (newBody.length < 1 || newBody.length > MAX_BODY_CHARS) {
    return Response.json(
      { error: `body length must be 1-${MAX_BODY_CHARS} chars` },
      { status: 400 },
    );
  }

  if (!fs.existsSync(skillDir)) {
    return Response.json(
      { error: `skill '${slug}' not found` },
      { status: 404 },
    );
  }

  const tmpPath = `${skillFile}.tmp`;
  let modified_at = 0;
  try {
    fs.writeFileSync(tmpPath, newBody, "utf8");
    fs.renameSync(tmpPath, skillFile);
    modified_at = fs.statSync(skillFile).mtimeMs;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to write SKILL.md: ${msg}` },
      { status: 500 },
    );
  }

  const detail: SkillDetail = {
    name: slug,
    slug,
    path: skillFile,
    body: newBody,
    preview: newBody.slice(0, PREVIEW_CHARS),
    modified_at,
  };
  return Response.json({ skill: detail });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; skill: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id, skill: rawSlug } = await ctx.params;
  if (id === "system") {
    return Response.json(
      { error: "system agent skills are not editable" },
      { status: 400 },
    );
  }
  const resolved = await resolveSkillPaths(id, rawSlug);
  if ("error" in resolved) return resolved.error;
  const { skillDir, slug } = resolved;

  if (!fs.existsSync(skillDir)) {
    return Response.json(
      { error: `skill '${slug}' not found` },
      { status: 404 },
    );
  }

  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to delete skill: ${msg}` },
      { status: 500 },
    );
  }
  return Response.json({ ok: true });
}
