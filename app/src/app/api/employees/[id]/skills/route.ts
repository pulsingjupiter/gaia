/**
 * GET  /api/employees/[id]/skills           → { skills: SkillEntry[] }
 * POST /api/employees/[id]/skills           → create a new skill folder + SKILL.md
 *
 * GET walks agents/<id>/.claude/skills/ and returns one entry per subfolder.
 * Each entry includes the first 200 chars of SKILL.md as a preview. Returns
 * an empty array when the skills dir is missing.
 *
 * POST accepts EITHER:
 *   1. Legacy raw shape:  { name, body }
 *      Body is written verbatim as the SKILL.md content.
 *   2. Structured shape:  { name, slug?, when_to_use, inputs, output, defaults? }
 *      Body is composed via `composeSkillMd` (Feature C — in-app skill editor).
 *
 * Either way the result is the same on disk: a new
 *   agents/<id>/.claude/skills/<slug>/SKILL.md
 * Returns 409 if the slug already exists. Rejects the 'system' pseudo-agent.
 */
import path from "node:path";
import fs from "node:fs";

import { getEmployee, PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import {
  ScaffoldError,
  composeSkillMd,
  writeSkillFile,
} from "@/server/agent-scaffold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 200;
const MAX_NAME_CHARS = 50;
const MAX_BODY_CHARS = 10_000;
const MAX_FIELD_CHARS = 2_000;

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

type LegacyBody = { name?: unknown; body?: unknown };
type StructuredBody = {
  name?: unknown;
  slug?: unknown;
  when_to_use?: unknown;
  inputs?: unknown;
  output?: unknown;
  defaults?: unknown;
};

function isStructured(b: LegacyBody & StructuredBody): boolean {
  // The structured shape is identified by the presence of any of the
  // composed-body fields. We tolerate either spelling so a caller mixing
  // them gets a clear validation error rather than silent fall-through.
  return (
    typeof b.when_to_use === "string" ||
    typeof b.inputs === "string" ||
    typeof b.output === "string" ||
    typeof b.defaults === "string"
  );
}

function isLegacy(b: LegacyBody): boolean {
  return typeof b.body === "string";
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

  let raw: LegacyBody & StructuredBody;
  try {
    raw = (await request.json()) as LegacyBody & StructuredBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Both shapes require a name.
  const rawName = raw?.name;
  if (typeof rawName !== "string") {
    return Response.json({ error: "name must be a string" }, { status: 400 });
  }
  const name = rawName.trim();
  if (name.length < 1 || name.length > MAX_NAME_CHARS) {
    return Response.json(
      { error: `name length must be 1-${MAX_NAME_CHARS} chars` },
      { status: 400 },
    );
  }

  // Slug — prefer caller-provided (Feature C clients send the canonical
  // slug they previewed), else derive.
  let slug: string;
  if (typeof raw.slug === "string" && raw.slug.trim()) {
    slug = slugify(raw.slug);
  } else {
    slug = slugify(name);
  }
  if (!slug) {
    return Response.json(
      { error: "name must contain at least one alphanumeric character" },
      { status: 400 },
    );
  }

  // Decide which shape we're handling.
  let composedBody: string;
  if (isStructured(raw)) {
    if (typeof raw.when_to_use !== "string" || !raw.when_to_use.trim()) {
      return Response.json(
        { error: "when_to_use (string) required" },
        { status: 400 },
      );
    }
    if (typeof raw.inputs !== "string" || !raw.inputs.trim()) {
      return Response.json(
        { error: "inputs (string) required" },
        { status: 400 },
      );
    }
    if (typeof raw.output !== "string" || !raw.output.trim()) {
      return Response.json(
        { error: "output (string) required" },
        { status: 400 },
      );
    }
    const defaults =
      typeof raw.defaults === "string" ? raw.defaults.trim() : undefined;

    for (const [label, val] of [
      ["when_to_use", raw.when_to_use],
      ["inputs", raw.inputs],
      ["output", raw.output],
      ["defaults", defaults ?? ""],
    ] as const) {
      if (typeof val === "string" && val.length > MAX_FIELD_CHARS) {
        return Response.json(
          { error: `${label} length must be ≤ ${MAX_FIELD_CHARS} chars` },
          { status: 400 },
        );
      }
    }

    composedBody = composeSkillMd({
      slug,
      when_to_use: raw.when_to_use,
      inputs: raw.inputs,
      output: raw.output,
      defaults,
    });
  } else if (isLegacy(raw)) {
    const rawBody = raw.body;
    if (typeof rawBody !== "string") {
      return Response.json({ error: "body must be a string" }, { status: 400 });
    }
    if (rawBody.length < 1 || rawBody.length > MAX_BODY_CHARS) {
      return Response.json(
        { error: `body length must be 1-${MAX_BODY_CHARS} chars` },
        { status: 400 },
      );
    }
    composedBody = rawBody;
  } else {
    return Response.json(
      {
        error:
          "body must include either { body } (raw) or { when_to_use, inputs, output } (structured)",
      },
      { status: 400 },
    );
  }

  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);

  try {
    writeSkillFile({ agent_dir: agentDir, slug, body: composedBody });
  } catch (err) {
    if (err instanceof ScaffoldError) {
      if (err.code === "skill_dir_exists") {
        return Response.json({ error: err.message }, { status: 409 });
      }
      if (err.code === "invalid_slug" || err.code === "path_traversal") {
        return Response.json({ error: err.message }, { status: 400 });
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to create skill: ${msg}` },
      { status: 500 },
    );
  }

  const preview = composedBody.slice(0, PREVIEW_CHARS);
  const skillFile = path.join(agentDir, ".claude", "skills", slug, "SKILL.md");
  const skill: SkillEntry = {
    name: slug,
    slug,
    path: skillFile,
    preview,
  };
  return Response.json({ ok: true, skill }, { status: 201 });
}
