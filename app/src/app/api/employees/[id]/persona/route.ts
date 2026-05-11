/**
 * GET /api/employees/[id]/persona → { markdown_text: string }
 * PUT /api/employees/[id]/persona → overwrite agents/<id>/CLAUDE.md
 *
 * Reads / writes agents/<id>/CLAUDE.md from disk. Returns 404 if the agent
 * doesn't exist, or if the persona file is missing for GET (the 'system'
 * pseudo-agent has no CLAUDE.md, so GET 404s for it). PUT 400s for the
 * 'system' agent — its persona is not editable.
 *
 * Atomic write: text is written to a sibling .tmp file then renamed over
 * CLAUDE.md so a partial write never corrupts the persona on disk.
 */
import path from "node:path";
import fs from "node:fs";

import { getEmployee, PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PERSONA_CHARS = 10000;

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
  // Resolve the persona file from the recorded agent_dir, falling back to
  // <agentsDir>/<id>/CLAUDE.md if the row's agent_dir is somehow stale.
  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);
  const claudeMd = path.join(agentDir, "CLAUDE.md");

  if (!fs.existsSync(claudeMd)) {
    return Response.json(
      { error: `CLAUDE.md not found for '${id}'`, path: claudeMd },
      { status: 404 },
    );
  }
  let markdown_text: string;
  try {
    markdown_text = fs.readFileSync(claudeMd, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `failed to read CLAUDE.md: ${msg}` }, { status: 500 });
  }
  return Response.json({ markdown_text, path: claudeMd });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (id === "system") {
    return Response.json(
      { error: "system agent persona is not editable" },
      { status: 400 },
    );
  }
  const employee = getEmployee(id);
  if (!employee) {
    return Response.json({ error: `employee '${id}' not found` }, { status: 404 });
  }

  let body: { markdown_text?: unknown };
  try {
    body = (await request.json()) as { markdown_text?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const markdown_text = body?.markdown_text;
  if (typeof markdown_text !== "string") {
    return Response.json(
      { error: "markdown_text must be a string" },
      { status: 400 },
    );
  }
  if (markdown_text.length < 1 || markdown_text.length > MAX_PERSONA_CHARS) {
    return Response.json(
      {
        error: `markdown_text length must be 1-${MAX_PERSONA_CHARS} chars (got ${markdown_text.length})`,
      },
      { status: 400 },
    );
  }

  const agentDir = employee.agent_dir || path.join(PATHS.agentsDir, id);
  const claudeMd = path.join(agentDir, "CLAUDE.md");
  const tmpPath = `${claudeMd}.tmp`;

  try {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(tmpPath, markdown_text, "utf8");
    fs.renameSync(tmpPath, claudeMd);
  } catch (err) {
    // Best-effort cleanup of the tmp file if the rename never happened.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to write CLAUDE.md: ${msg}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, markdown_text, path: claudeMd });
}
