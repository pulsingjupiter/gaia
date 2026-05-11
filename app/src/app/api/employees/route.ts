/**
 * GET  /api/employees       → { employees: EmployeeRow[] }
 * POST /api/employees       → create employee + scaffold agent dir
 *
 * Wave 2A. Touches DB + filesystem (Node-only).
 */
import path from "node:path";
import fs from "node:fs";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

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

  if (getEmployee(id)) {
    return Response.json({ error: `employee '${id}' already exists` }, { status: 409 });
  }

  const status =
    typeof body.status === "string" && body.status.trim() ? body.status : "idle";
  const accent_color =
    typeof body.accent_color === "string" ? body.accent_color : null;
  const avatar_emoji =
    typeof body.avatar_emoji === "string" ? body.avatar_emoji : null;
  const agent_dir = path.join(PATHS.agentsDir, id);
  const now = Date.now();

  // Scaffold filesystem first (idempotent — mkdirSync recursive is fine).
  try {
    fs.mkdirSync(agent_dir, { recursive: true });
    fs.mkdirSync(path.join(agent_dir, ".claude", "skills"), { recursive: true });
    const claudeMd = path.join(agent_dir, "CLAUDE.md");
    if (!fs.existsSync(claudeMd)) {
      fs.writeFileSync(
        claudeMd,
        [
          `# ${body.name} — ${body.role}`,
          ``,
          `You are ${body.name}. Read this file for your persona and role.`,
          ``,
          `## What you do`,
          `(Describe your responsibilities here.)`,
          ``,
          `## Inbox / inter-agent`,
          `Read \`inbox.json\` at the start of each run. You may write up to 3`,
          `outbound messages by appending to \`inbox.json\`.`,
          ``,
        ].join("\n"),
      );
    }
    const inbox = path.join(agent_dir, "inbox.json");
    if (!fs.existsSync(inbox)) {
      fs.writeFileSync(inbox, "[]\n");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to scaffold agent dir: ${msg}` },
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
  return Response.json({ employee }, { status: 201 });
}
