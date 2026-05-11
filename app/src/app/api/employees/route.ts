/**
 * GET  /api/employees       → { employees: EmployeeRow[] }
 * POST /api/employees       → create employee + scaffold agent dir
 *
 * Wave 2A. Touches DB + filesystem (Node-only).
 *
 * POST accepts an optional `template_id` — when provided and known, the
 * agent dir is scaffolded with the template's CLAUDE.md and default
 * SKILL.md (see `lib/agent-templates.ts`). When omitted, a blank stub is
 * written (matches the legacy behaviour). The actual filesystem work is
 * delegated to `server/agent-scaffold.ts` so the same helper is shared
 * with `/api/teams/apply`.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  getAgentSpendToday,
  getDb,
  listEmployees,
  getEmployee,
  PATHS,
  type EmployeeRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { slugify } from "@/lib/slugify";
import { getTemplateById } from "@/lib/agent-templates";
import { ScaffoldError, scaffoldAgentFiles } from "@/server/agent-scaffold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(): Promise<Response> {
  ensureSeeded();
  const rows = listEmployees();
  // Decorate each row with `spend_today_usd` (sum of success-run cost_usd for
  // the agent since SGT midnight). Used by Settings → Agents to render the
  // "Spent today: $X / $Y cap" hint inline with each cap input. Cheap O(N)
  // queries — N is small (<= a few dozen agents).
  const employees = rows.map((r) => ({
    ...r,
    spend_today_usd: getAgentSpendToday(r.id),
  }));
  return Response.json({ employees });
}

type CreateBody = {
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  accent_color?: string | null;
  avatar_emoji?: string | null;
  /**
   * Optional preset id from `lib/agent-templates.ts`. When provided, the
   * agent dir is scaffolded with the template's CLAUDE.md + default
   * SKILL.md. Unknown ids are rejected with a 400 so misconfigured
   * clients fail loudly.
   */
  template_id?: string | null;
};

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  if (!body || typeof body !== "object") return badRequest("body must be object");
  if (typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("name (string) required");
  }
  if (typeof body.role !== "string" || !body.role.trim()) {
    return badRequest("role (string) required");
  }

  const id =
    typeof body.id === "string" && body.id.trim()
      ? slugify(body.id)
      : slugify(body.name) || randomUUID().slice(0, 8);

  if (!id) {
    return badRequest("name must contain at least one alphanumeric character");
  }

  if (getEmployee(id)) {
    return Response.json({ error: `employee '${id}' already exists` }, { status: 409 });
  }

  // Validate template_id up front so a typo fails before we touch the FS.
  let templateId: string | null = null;
  if (typeof body.template_id === "string" && body.template_id.trim()) {
    const tpl = getTemplateById(body.template_id.trim());
    if (!tpl) {
      return badRequest(`unknown template_id '${body.template_id}'`);
    }
    templateId = tpl.id;
  }

  const status =
    typeof body.status === "string" && body.status.trim() ? body.status : "idle";
  const accent_color =
    typeof body.accent_color === "string" ? body.accent_color : null;
  const avatar_emoji =
    typeof body.avatar_emoji === "string" ? body.avatar_emoji : null;
  const now = Date.now();

  // Scaffold filesystem first. Refuses to overwrite an existing dir, which
  // is the contract the spec wants — if a leftover dir is on disk we surface
  // a 409 instead of silently merging.
  let agent_dir: string;
  try {
    const result = scaffoldAgentFiles({
      slug: id,
      name: body.name.trim(),
      role: body.role.trim(),
      template_id: templateId,
    });
    agent_dir = result.agent_dir;
  } catch (err) {
    if (err instanceof ScaffoldError) {
      if (err.code === "agent_dir_exists") {
        return Response.json({ error: err.message }, { status: 409 });
      }
      if (err.code === "invalid_slug" || err.code === "path_traversal") {
        return badRequest(err.message);
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to scaffold agent dir: ${msg}` },
      { status: 500 },
    );
  }

  // Belt-and-braces: in pathological cases the helper could return a path
  // outside PATHS.agentsDir if the resolver were ever loosened — sanity
  // check before persisting.
  const expected = path.join(PATHS.agentsDir, id);
  if (path.resolve(agent_dir) !== path.resolve(expected)) {
    return Response.json(
      { error: `scaffold returned unexpected path: ${agent_dir}` },
      { status: 500 },
    );
  }

  getDb()
    .prepare(
      `INSERT INTO employees (id, name, role, status, accent_color, avatar_emoji, agent_dir, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      body.name.trim(),
      body.role.trim(),
      status,
      accent_color,
      avatar_emoji,
      agent_dir,
      now,
    );

  const employee = getEmployee(id) as EmployeeRow;
  return Response.json({ employee, applied_template_id: templateId }, { status: 201 });
}
