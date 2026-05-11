/**
 * GET  /api/tasks?cron_only=1&enabled=1&employee_id=&project_id=
 *      → { tasks: TaskRow[] }
 *      Pulls from the same `tasks` table as /api/backlog. Defaults to ALL
 *      statuses (NOT only 'backlog'). cron_only=1 filters down to rows with a
 *      non-empty schedule_cron. enabled=1 filters to enabled rows.
 *
 * POST /api/tasks
 *      body: { title, employee_id, skill, schedule_cron, human_label?, project_id? }
 *      → 201 { task }
 *      Cron-style task creator. Generates a slug-based id from the title and
 *      defaults `enabled=1`, `status='backlog'`. The cron scheduler picks it
 *      up on the next 30s sync.
 *
 * Wave 2B (notifications + cron). Coexists with /api/backlog — that route
 * remains the canonical backlog GET/POST; this route is the cron-friendly
 * shape three downstream UI agents will consume.
 */
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getTask,
  insertTask,
  listAllTasks,
  type TaskFilters,
  type TaskRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `task-${randomUUID().slice(0, 8)}`
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const cronOnly = sp.get("cron_only") === "1";
  const enabledOnly = sp.get("enabled") === "1";

  const filters: TaskFilters = {};
  const employee_id = sp.get("employee_id");
  if (employee_id) filters.employee_id = employee_id;
  const project_id = sp.get("project_id");
  if (project_id) filters.project_id = project_id;
  const search = sp.get("search");
  if (search) filters.search = search;

  let tasks: TaskRow[] = listAllTasks(filters);
  if (cronOnly) {
    tasks = tasks.filter(
      (t) => typeof t.schedule_cron === "string" && t.schedule_cron.trim() !== "",
    );
  }
  if (enabledOnly) {
    tasks = tasks.filter((t) => t.enabled === 1);
  }
  return Response.json({ tasks });
}

type CreateBody = {
  title?: unknown;
  employee_id?: unknown;
  skill?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
  project_id?: unknown;
  description?: unknown;
};

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v;
}

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object")
    return badRequest("body must be object");

  if (typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("title (non-empty string) required");
  }
  if (typeof body.employee_id !== "string" || !body.employee_id.trim()) {
    return badRequest("employee_id (string) required");
  }
  if (typeof body.skill !== "string" || !body.skill.trim()) {
    return badRequest("skill (string) required");
  }
  if (
    typeof body.schedule_cron !== "string" ||
    !body.schedule_cron.trim()
  ) {
    return badRequest("schedule_cron (string) required");
  }

  // Generate a unique id from the title slug.
  let id = slugify(body.title);
  while (getTask(id)) {
    id = `${slugify(body.title)}-${randomUUID().slice(0, 4)}`;
  }

  const task = insertTask({
    id,
    title: body.title.trim(),
    employee_id: body.employee_id.trim(),
    skill: body.skill.trim(),
    schedule_cron: body.schedule_cron.trim(),
    human_label: strOrNull(body.human_label),
    project_id: strOrNull(body.project_id),
    description: strOrNull(body.description),
    enabled: 1,
    status: "backlog",
    priority: "medium",
  });
  return Response.json({ task }, { status: 201 });
}
