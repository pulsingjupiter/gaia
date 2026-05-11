/**
 * GET  /api/employees/[id]/skills           → { skills: SkillEntry[] }
 * POST /api/employees/[id]/skills           → create a new skill folder + SKILL.md
 *
 * GET walks agents/<id>/.claude/skills/ and returns one entry per subfolder.
 * Each entry includes the first 200 chars of SKILL.md as a preview. Returns
 * an empty array when the skills dir is missing.
 *
 * POST accepts { name, body } and creates
 *   agents/<id>/.claude/skills/<slug>/SKILL.md
 * where <slug> is derived from the name (kebab-case, alphanumeric only).
 * 409 if the slug already exists. 400 for the 'system' pseudo-agent.
 */
import path from "node:path";
import fs from "node:fs";

import { getEmployee, PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 200;
const MAX_NAME_CHARS = 50;
const MAX_BODY_CHARS = 5000;

export type SkillEntry = {
  name: string;
  slug: string;
  path: string;
  preview: string;
};

/**
 * Slug rules (mirrored on the [skill] route validators):
 *   - lowercase
 *   - alphanumeric + hyphen only
 *   - hyphens collapsed; no leading/trailing hyphen
 *   - non-empty after the transformation
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const employee = getEmployee(id);
  if (!employee) {
    return Response.json({ error: `employee '${id}' not found` }, { status: 404 });
  }

  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);
  const skillsRoot = path.join(agentDir, ".claude", "skills");

  if (!fs.existsSync(skillsRoot)) {
    return Response.json({ skills: [] satisfies SkillEntry[] });
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `failed to read skills dir: ${msg}` }, { status: 500 });
  }

  const skills: SkillEntry[] = [];
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name.startsWith(".")) continue;
    const skillDir = path.join(skillsRoot, dirent.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    let preview = "";
    if (fs.existsSync(skillFile)) {
      try {
        const raw = fs.readFileSync(skillFile, "utf8");
        preview = raw.slice(0, PREVIEW_CHARS);
      } catch {
        // ignore read errors — keep preview empty.
      }
    }
    skills.push({
      name: dirent.name,
      slug: dirent.name,
      path: skillFile,
      preview,
    });
  }

  // Stable alphabetical ordering so the UI doesn't shuffle on refresh.
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ skills });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (id === "system") {
    return Response.json(
      { error: "system agent skills are not editable" },
      { status: 400 },
    );
  }
  const employee = getEmployee(id);
  if (!employee) {
    return Response.json({ error: `employee '${id}' not found` }, { status: 404 });
  }

  let body: { name?: unknown; body?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; body?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const rawName = body?.name;
  const rawBody = body?.body;
  if (typeof rawName !== "string") {
    return Response.json({ error: "name must be a string" }, { status: 400 });
  }
  if (typeof rawBody !== "string") {
    return Response.json({ error: "body must be a string" }, { status: 400 });
  }
  const name = rawName.trim();
  if (name.length < 1 || name.length > MAX_NAME_CHARS) {
    return Response.json(
      { error: `name length must be 1-${MAX_NAME_CHARS} chars` },
      { status: 400 },
    );
  }
  if (rawBody.length < 1 || rawBody.length > MAX_BODY_CHARS) {
    return Response.json(
      { error: `body length must be 1-${MAX_BODY_CHARS} chars` },
      { status: 400 },
    );
  }
  const slug = slugify(name);
  if (!slug) {
    return Response.json(
      { error: "name must contain at least one alphanumeric character" },
      { status: 400 },
    );
  }

  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);
  const skillsRoot = path.join(agentDir, ".claude", "skills");
  const skillDir = path.join(skillsRoot, slug);
  const skillFile = path.join(skillDir, "SKILL.md");
  const tmpPath = `${skillFile}.tmp`;

  if (fs.existsSync(skillDir)) {
    return Response.json(
      { error: `skill '${slug}' already exists` },
      { status: 409 },
    );
  }

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(tmpPath, rawBody, "utf8");
    fs.renameSync(tmpPath, skillFile);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to create skill: ${msg}` },
      { status: 500 },
    );
  }

  const preview = rawBody.slice(0, PREVIEW_CHARS);
  const skill: SkillEntry = {
    name: slug,
    slug,
    path: skillFile,
    preview,
  };
  return Response.json({ ok: true, skill }, { status: 201 });
}
