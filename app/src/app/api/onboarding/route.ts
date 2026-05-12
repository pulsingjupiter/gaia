/**
 * POST /api/onboarding
 *
 * One-shot endpoint that the wizard at /onboarding posts to once the user
 * finishes step 3. Composes the existing employee + project create paths so
 * the resulting rows match what those endpoints would have produced — but in
 * a single round-trip and with persona seeding from the canonical
 * `agents/<persona>/CLAUDE.md` file at the project root.
 *
 * Body shape:
 *   { persona: 'king-henry' | 'atlas' | 'nova' | 'rack' | 'gaia' | 'custom',
 *     project: { name: string, description?: string } }
 *
 * Test-instance only — refuses on prod (when GAIA_TEST_MODE != '1').
 */
import path from "node:path";
import fs from "node:fs";

import {
  PATHS,
  getDb,
  getEmployee,
  upsertProject,
  type EmployeeRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONAS = {
  "king-henry": {
    name: "King Henry",
    role: "Chief of Staff",
    accent: "#F59E0B",
    avatar: "paladin",
  },
  atlas: {
    name: "Atlas",
    role: "Research Analyst",
    accent: "#10B981",
    avatar: "wizard",
  },
  nova: {
    name: "Nova",
    role: "Content Strategist",
    accent: "#F472B6",
    avatar: "bard",
  },
  rack: {
    name: "Rack",
    role: "Automation Engineer",
    accent: "#3B82F6",
    avatar: "monk",
  },
  gaia: {
    name: "Gaia",
    role: "Meta-Agent & Architect",
    accent: "#5B5BD6",
    avatar: "sorcerer",
  },
} as const;

type PersonaId = keyof typeof PERSONAS | "custom";

type Body = {
  persona?: PersonaId;
  custom?: { name?: string; role?: string };
  project?: { name?: string; description?: string };
};

function bad(msg: string, status = 400): Response {
  return Response.json({ error: msg }, { status });
}

function readPersonaClaudeMd(personaId: string): string | null {
  // CLAUDE.md lives at <projectRoot>/agents/<id>/CLAUDE.md regardless of
  // GAIA_AGENTS_DIR — that env var only affects where new agents get
  // scaffolded for the test instance, not where the canonical persona
  // definitions are stored.
  const p = path.join(PATHS.projectRoot, "agents", personaId, "CLAUDE.md");
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function defaultClaudeMd(name: string, role: string): string {
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

export async function POST(request: Request): Promise<Response> {
  if (process.env.GAIA_TEST_MODE !== "1") {
    return bad("onboarding endpoint is test-mode only", 403);
  }
  ensureSeeded();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("invalid JSON body");
  }

  const personaId = body.persona;
  if (!personaId) return bad("persona required");

  let agentId: string;
  let agentName: string;
  let agentRole: string;
  let accent: string;
  let avatar: string | null;
  let claudeMd: string;

  if (personaId === "custom") {
    const customName = body.custom?.name?.trim();
    const customRole = body.custom?.role?.trim();
    if (!customName) return bad("custom.name required");
    agentId = customName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `agent-${Date.now()}`;
    agentName = customName;
    agentRole = customRole || "Generalist";
    accent = "#5B5BD6";
    avatar = "knight";
    claudeMd = defaultClaudeMd(agentName, agentRole);
  } else if (personaId in PERSONAS) {
    const def = PERSONAS[personaId];
    agentId = personaId;
    agentName = def.name;
    agentRole = def.role;
    accent = def.accent;
    avatar = def.avatar;
    claudeMd =
      readPersonaClaudeMd(personaId) ?? defaultClaudeMd(agentName, agentRole);
  } else {
    return bad(`unknown persona: ${personaId}`);
  }

  if (getEmployee(agentId)) {
    return Response.json(
      { error: `agent '${agentId}' already exists` },
      { status: 409 },
    );
  }

  const projectName = body.project?.name?.trim();
  const projectDesc = body.project?.description?.trim();
  if (!projectName) return bad("project.name required");

  const agentDir = path.join(PATHS.agentsDir, agentId);
  try {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(agentDir, ".claude", "skills"), { recursive: true });
    const claudeMdPath = path.join(agentDir, "CLAUDE.md");
    if (!fs.existsSync(claudeMdPath))
      fs.writeFileSync(claudeMdPath, claudeMd);
    const inboxPath = path.join(agentDir, "inbox.json");
    if (!fs.existsSync(inboxPath)) fs.writeFileSync(inboxPath, "[]\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to scaffold agent dir: ${msg}` },
      { status: 500 },
    );
  }

  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO employees (id, name, role, status, accent_color, avatar_emoji, agent_dir, created_at)
       VALUES (?, ?, ?, 'idle', ?, ?, ?, ?)`,
    )
    .run(agentId, agentName, agentRole, accent, avatar, agentDir, now);

  const employee = getEmployee(agentId) as EmployeeRow;

  // Project gets a synthetic path under the test agents dir so we don't
  // require the user to point at a real folder during onboarding.
  const projectSlug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `project-${now}`;
  const projectPath = path.join(PATHS.agentsDir, "_shared", "projects", projectSlug);
  try {
    fs.mkdirSync(projectPath, { recursive: true });
  } catch {
    // non-fatal — project rows tolerate a missing on-disk path in test mode
  }

  const project = upsertProject({
    name: projectName,
    path: projectPath,
    description: projectDesc ?? null,
    color: accent,
    agent_name: agentName,
    agent_avatar: avatar,
  });

  return Response.json({ employee, project }, { status: 201 });
}
