/**
 * POST /api/teams/apply
 *
 * Body: { team_id: string, include_template_ids: string[] }
 *
 * Iterates `include_template_ids`, validates each against the
 * AGENT_TEMPLATES registry, and scaffolds the corresponding agent for any
 * slug that doesn't already exist in the DB. Returns the rows that were
 * created plus structured info for everything skipped.
 *
 * Sibling to POST /api/employees — both go through
 * `scaffoldAgentFiles` in `server/agent-scaffold.ts` so on-disk layout
 * stays consistent.
 */
import path from "node:path";

import {
  getDb,
  listEmployees,
  getEmployee,
  PATHS,
  type EmployeeRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import {
  AGENT_TEMPLATES,
  getTemplateById,
  type AgentTemplate,
} from "@/lib/agent-templates";
import { getTeamById } from "@/lib/agent-teams";
import { ScaffoldError, scaffoldAgentFiles } from "@/server/agent-scaffold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyBody = {
  team_id?: unknown;
  include_template_ids?: unknown;
};

type SkippedReason =
  | "already_exists"
  | "unknown_template"
  | "agent_dir_exists"
  | "scaffold_failed";

type SkippedEntry = {
  template_id: string;
  reason: SkippedReason;
  message?: string;
};

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");

  if (typeof body.team_id !== "string" || !body.team_id.trim()) {
    return badRequest("team_id (string) required");
  }
  const team = getTeamById(body.team_id.trim());
  if (!team) {
    return badRequest(`unknown team_id '${body.team_id}'`);
  }

  if (!Array.isArray(body.include_template_ids)) {
    return badRequest("include_template_ids (string[]) required");
  }
  const requested = body.include_template_ids.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (requested.length === 0) {
    return badRequest("include_template_ids must be non-empty");
  }

  // Caller can only opt INTO templates that belong to this team; opting
  // into an arbitrary template through this endpoint would conflate the
  // two routes' contracts.
  const teamSet = new Set(team.template_ids);
  const filtered = requested.filter((id) => teamSet.has(id));
  const outOfBand = requested.filter((id) => !teamSet.has(id));

  const created: EmployeeRow[] = [];
  const skipped: SkippedEntry[] = outOfBand.map((id) => ({
    template_id: id,
    reason: "unknown_template" as const,
    message: `template '${id}' is not part of team '${team.id}'`,
  }));

  // Pre-load existing employee slugs once — cheaper than calling
  // getEmployee per template.
  const existingIds = new Set(listEmployees().map((e) => e.id));

  for (const tid of filtered) {
    const tpl: AgentTemplate | undefined = getTemplateById(tid);
    if (!tpl) {
      skipped.push({ template_id: tid, reason: "unknown_template" });
      continue;
    }
    if (existingIds.has(tpl.id)) {
      skipped.push({ template_id: tid, reason: "already_exists" });
      continue;
    }
    // Race-window guard — another writer could have inserted the slug
    // between the listEmployees() snapshot and now. Cheap re-check.
    if (getEmployee(tpl.id)) {
      skipped.push({ template_id: tid, reason: "already_exists" });
      continue;
    }

    let agentDir: string;
    try {
      const result = scaffoldAgentFiles({
        slug: tpl.id,
        name: tpl.name,
        role: tpl.role,
        template_id: tpl.id,
      });
      agentDir = result.agent_dir;
    } catch (err) {
      if (err instanceof ScaffoldError && err.code === "agent_dir_exists") {
        // Leftover on-disk dir from a prior aborted create — surface so
        // the user can decide whether to delete it manually.
        skipped.push({
          template_id: tid,
          reason: "agent_dir_exists",
          message: err.message,
        });
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({
        template_id: tid,
        reason: "scaffold_failed",
        message: msg,
      });
      continue;
    }

    // Sanity-check the resolved path stays inside agentsDir.
    const expected = path.join(PATHS.agentsDir, tpl.id);
    if (path.resolve(agentDir) !== path.resolve(expected)) {
      skipped.push({
        template_id: tid,
        reason: "scaffold_failed",
        message: `scaffold returned unexpected path: ${agentDir}`,
      });
      continue;
    }

    const now = Date.now();
    try {
      getDb()
        .prepare(
          `INSERT INTO employees (id, name, role, status, accent_color, avatar_emoji, agent_dir, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(tpl.id, tpl.name, tpl.role, "idle", tpl.accent, tpl.avatar_id, agentDir, now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({
        template_id: tid,
        reason: "scaffold_failed",
        message: `db insert failed: ${msg}`,
      });
      continue;
    }

    const row = getEmployee(tpl.id);
    if (row) {
      created.push(row);
      existingIds.add(row.id);
    }
  }

  return Response.json(
    {
      team_id: team.id,
      created,
      skipped,
    },
    { status: 201 },
  );
}

// Re-export so any future caller can introspect what templates exist
// without re-importing the registry. (Currently unused.)
export type { AgentTemplate } from "@/lib/agent-templates";
// Mark AGENT_TEMPLATES as touched to avoid stripped-import linter false
// positives — useful because we re-export the type above.
void AGENT_TEMPLATES;
