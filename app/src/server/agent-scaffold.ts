/**
 * agent-scaffold — shared filesystem helpers for agent + skill creation.
 *
 * Two entry points:
 *   - `scaffoldAgentFiles({...})` writes the full agent_dir (CLAUDE.md +
 *     default SKILL.md + inbox.json). Used by:
 *       - POST /api/employees (when template_id is provided OR for a
 *         blank create)
 *       - POST /api/teams/apply (per template_id)
 *
 *   - `writeSkillFile({...})` writes a single SKILL.md under an agent's
 *     `.claude/skills/<slug>/` folder. Used by:
 *       - scaffoldAgentFiles (when applying a template's default_skill)
 *       - POST /api/employees/[id]/skills (composed body)
 *
 * Both helpers refuse to clobber existing files. The agent-dir helper
 * additionally checks that the resolved path stays inside `PATHS.agentsDir`
 * — slugs come from user input.
 */
import path from "node:path";
import fs from "node:fs";

import { PATHS } from "@/server/db.ts";
import { getTemplateById, type AgentTemplate } from "@/lib/agent-templates";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ScaffoldErrorCode =
  | "invalid_slug"
  | "path_traversal"
  | "agent_dir_exists"
  | "skill_dir_exists"
  | "io_error";

export class ScaffoldError extends Error {
  code: ScaffoldErrorCode;
  constructor(code: ScaffoldErrorCode, message: string) {
    super(message);
    this.name = "ScaffoldError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertValidSlug(slug: string): void {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 64) {
    throw new ScaffoldError("invalid_slug", `slug must be 1-64 chars`);
  }
  if (slug.startsWith(".") || slug.startsWith("-")) {
    throw new ScaffoldError("invalid_slug", `slug cannot start with '.' or '-'`);
  }
  if (!SLUG_RE.test(slug)) {
    throw new ScaffoldError(
      "invalid_slug",
      `slug must be lowercase kebab-case (a-z, 0-9, '-')`,
    );
  }
}

/**
 * Resolve a path inside `agentsDir` and refuse anything that escapes via `..`
 * or symlink tricks. Returns the canonical absolute path.
 */
function resolveInsideAgentsDir(...segments: string[]): string {
  const agentsRoot = path.resolve(PATHS.agentsDir);
  const target = path.resolve(agentsRoot, ...segments);
  const rel = path.relative(agentsRoot, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ScaffoldError(
      "path_traversal",
      `resolved path escapes agents dir: ${target}`,
    );
  }
  return target;
}

// ---------------------------------------------------------------------------
// Public: scaffoldAgentFiles
// ---------------------------------------------------------------------------

export type ScaffoldResult = {
  /** Absolute path to the agent's home dir (inside `PATHS.agentsDir`). */
  agent_dir: string;
  /** True iff a template was applied (vs. blank scaffold). */
  applied_template_id: string | null;
};

export type ScaffoldAgentInput = {
  /** Agent slug (also the dir name under `agents/`). */
  slug: string;
  /** Display name written into the blank CLAUDE.md fallback. */
  name: string;
  /** Display role written into the blank CLAUDE.md fallback. */
  role: string;
  /** Optional template id — when provided, applies the template's content. */
  template_id?: string | null;
};

/**
 * Scaffolds `<agentsDir>/<slug>/` with:
 *   - CLAUDE.md (template body or a blank stub)
 *   - inbox.json ("[]\n")
 *   - .claude/skills/<default_skill.slug>/SKILL.md  (only when template applied)
 *
 * Refuses if the agent dir already exists. Idempotent for the empty case is
 * NOT supported — call sites must check existence and short-circuit before
 * creating the DB row.
 */
export function scaffoldAgentFiles(input: ScaffoldAgentInput): ScaffoldResult {
  assertValidSlug(input.slug);
  const agentDir = resolveInsideAgentsDir(input.slug);

  if (fs.existsSync(agentDir)) {
    throw new ScaffoldError(
      "agent_dir_exists",
      `agent dir already exists: ${agentDir}`,
    );
  }

  let template: AgentTemplate | undefined;
  if (input.template_id) {
    template = getTemplateById(input.template_id);
    if (!template) {
      // We tolerate an unknown template_id by falling back to the blank
      // scaffold — the API layer can validate the id itself if it wants
      // a hard error. This keeps the helper robust to future template
      // deprecations.
      template = undefined;
    }
  }

  try {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(agentDir, ".claude", "skills"), { recursive: true });

    const claudeBody = template
      ? template.claude_md
      : blankClaudeMd(input.name, input.role);
    const claudePath = path.join(agentDir, "CLAUDE.md");
    if (!fs.existsSync(claudePath)) {
      fs.writeFileSync(claudePath, ensureTrailingNewline(claudeBody), "utf8");
    }

    const inboxPath = path.join(agentDir, "inbox.json");
    if (!fs.existsSync(inboxPath)) {
      fs.writeFileSync(inboxPath, "[]\n", "utf8");
    }

    if (template) {
      writeSkillFile({
        agent_dir: agentDir,
        slug: template.default_skill.slug,
        body: template.default_skill.skill_md,
      });
    }
  } catch (err) {
    if (err instanceof ScaffoldError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScaffoldError("io_error", `failed to scaffold agent dir: ${msg}`);
  }

  return {
    agent_dir: agentDir,
    applied_template_id: template ? template.id : null,
  };
}

// ---------------------------------------------------------------------------
// Public: writeSkillFile
// ---------------------------------------------------------------------------

export type WriteSkillInput = {
  /** Absolute path to the agent's home dir. Must already exist. */
  agent_dir: string;
  /** Skill slug (folder name under `.claude/skills/`). */
  slug: string;
  /** Full SKILL.md body to write. */
  body: string;
};

/**
 * Writes `<agent_dir>/.claude/skills/<slug>/SKILL.md`.
 *
 * - Validates the slug is kebab-case.
 * - Asserts the resolved path stays inside `PATHS.agentsDir`.
 * - Atomic write via `<file>.tmp` + rename.
 * - Refuses to overwrite an existing skill directory.
 */
export function writeSkillFile(input: WriteSkillInput): string {
  assertValidSlug(input.slug);
  // The agent_dir caller has typically already resolved through
  // resolveInsideAgentsDir, but we re-assert here so writeSkillFile is safe
  // on its own (e.g. when called from the /skills POST route).
  const agentsRoot = path.resolve(PATHS.agentsDir);
  const agentDirAbs = path.resolve(input.agent_dir);
  const rel = path.relative(agentsRoot, agentDirAbs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ScaffoldError(
      "path_traversal",
      `agent_dir is not inside agents root: ${agentDirAbs}`,
    );
  }

  const skillsRoot = path.join(agentDirAbs, ".claude", "skills");
  const skillDir = path.join(skillsRoot, input.slug);
  const skillFile = path.join(skillDir, "SKILL.md");
  const tmpFile = `${skillFile}.tmp`;

  if (fs.existsSync(skillDir)) {
    throw new ScaffoldError(
      "skill_dir_exists",
      `skill '${input.slug}' already exists`,
    );
  }

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(tmpFile, ensureTrailingNewline(input.body), "utf8");
    fs.renameSync(tmpFile, skillFile);
  } catch (err) {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup failure
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScaffoldError("io_error", `failed to write SKILL.md: ${msg}`);
  }

  return skillFile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

function blankClaudeMd(name: string, role: string): string {
  // Matches the prior inline scaffold in the /api/employees POST handler so
  // blank creates produce the same starter content as before.
  return [
    `# ${name} — ${role}`,
    ``,
    `You are ${name}. Read this file for your persona and role.`,
    ``,
    `## What you do`,
    `(Describe your responsibilities here.)`,
    ``,
    `## Inbox / inter-agent`,
    `Read \`inbox.json\` at the start of each run. You may write up to 3`,
    `outbound messages by appending to \`inbox.json\`.`,
    ``,
  ].join("\n");
}

/**
 * Compose a SKILL.md body from structured fields. Used by both the in-app
 * editor and any caller that wants to build a SKILL.md programmatically
 * without hand-formatting the markdown.
 */
export function composeSkillMd(input: {
  slug: string;
  when_to_use: string;
  inputs: string;
  output: string;
  defaults?: string;
}): string {
  const sections: string[] = [
    `# Skill: ${input.slug}`,
    ``,
    `## When to use`,
    input.when_to_use.trim(),
    ``,
    `## Inputs`,
    input.inputs.trim(),
    ``,
    `## What you produce`,
    input.output.trim(),
  ];
  const defaults = input.defaults?.trim();
  if (defaults) {
    sections.push(``, `## Defaults`, defaults);
  }
  sections.push(``);
  return sections.join("\n");
}
