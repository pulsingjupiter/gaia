/**
 * GET  /api/backlog?employee_id=&priority=&search=&include_all=1
 *      → { tasks: TaskRow[] }
 *      Default: only tasks with status='backlog'.
 *      With include_all=1: returns tasks of every status (still respects other filters).
 *
 * POST /api/backlog
 *      body: { title, description?, employee_id?, skill?, priority?, playbook?,
 *              schedule_cron?, human_label? }
 *      → 201 { task: TaskRow }
 *
 * Wave 1 — backlog feeds the Backlog page in Wave 2.
 */
import type { NextRequest } from "next/server";

import {
  insertTask,
  listAllTasks,
  listBacklogTasks,
  type InsertTaskInput,
  type TaskFilters,
  type TaskPriority,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"];

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function parsePriority(v: unknown): TaskPriority | undefined {
  if (typeof v !== "string") return undefined;
  return (VALID_PRIORITIES as readonly string[]).includes(v)
    ? (v as TaskPriority)
    : undefined;
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const filters: TaskFilters = {};
  const employee_id = sp.get("employee_id");
  if (employee_id) filters.employee_id = employee_id;
  const priorityRaw = sp.get("priority");
  if (priorityRaw) {
    const p = parsePriority(priorityRaw);
    if (!p) return badRequest("priority must be high|medium|low");
    filters.priority = p;
  }
  const search = sp.get("search");
  if (search) filters.search = search;
  const project_id = sp.get("project_id");
  if (project_id) filters.project_id = project_id;

  const includeAll = sp.get("include_all") === "1";
  const tasks = includeAll ? listAllTasks(filters) : listBacklogTasks(filters);
  return Response.json({ tasks });
}

type CreateBody = {
  title?: unknown;
  description?: unknown;
  employee_id?: unknown;
  skill?: unknown;
  priority?: unknown;
  playbook?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
  status?: unknown;
  project_id?: unknown;
};

function strOrNull(v: unknown, field: string): string | null | "__bad__" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return "__bad__";
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
  if (!body || typeof body !== "object") return badRequest("body must be object");

  if (typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("title (non-empty string) required");
  }

  const fields: Array<[keyof CreateBody, string]> = [
    ["description", "description"],
    ["employee_id", "employee_id"],
    ["skill", "skill"],
    ["playbook", "playbook"],
    ["schedule_cron", "schedule_cron"],
    ["human_label", "human_label"],
    ["project_id", "project_id"],
  ];
  const parsed: Record<string, string | null> = {};
  for (const [k, label] of fields) {
    const r = strOrNull(body[k], label);
    if (r === "__bad__") return badRequest(`'${label}' must be string`);
    parsed[label] = r;
  }

  let priority: TaskPriority = "medium";
  if (body.priority !== undefined) {
    const p = parsePriority(body.priority);
    if (!p) return badRequest("priority must be high|medium|low");
    priority = p;
  }

  const input: InsertTaskInput = {
    title: body.title.trim(),
    description: parsed.description,
    employee_id: parsed.employee_id,
    skill: parsed.skill,
    playbook: parsed.playbook,
    schedule_cron: parsed.schedule_cron,
    human_label: parsed.human_label,
    project_id: parsed.project_id,
    priority,
    status: "backlog",
  };

  const task = insertTask(input);
  return Response.json({ task }, { status: 201 });
}
