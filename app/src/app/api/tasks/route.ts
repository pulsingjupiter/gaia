/**
 * GET  /api/tasks?employee_id=&project_id=&status=&priority=&search=
 *               &milestone_id=&due=overdue|today|this_week|none
 *      → { tasks: TaskRow[] }
 *
 *      Lists work tasks from the `tasks` table. Status defaults to ALL
 *      statuses; pass `status=todo` (etc.) to narrow. The `tasks` table is
 *      purely for work items after the cron-split — cron-fired autonomous
 *      runs live in `scheduled_runs` and are served by /api/scheduled-runs.
 *
 *      `milestone_id=__none__` filters to tasks with no milestone assigned.
 *      `due` accepts overdue|today|this_week|none, where `none` means no
 *      due date set. All three buckets only consider non-done/archived rows.
 *
 * POST /api/tasks
 *      body: { title, project_id?, employee_id?, status?, priority?,
 *              description?, milestone_id?, due_date? }
 *      → 201 { task }
 *
 *      Direct work-task creator. Defaults: status='todo', priority='medium'.
 *      The `schedule_cron` field is REJECTED here — cron rows must go through
 *      /api/scheduled-runs.
 */
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getTask,
  insertTask,
  listAllTasks,
  type TaskFilters,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
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

const VALID_PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"];
const VALID_KANBAN_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
];

const VALID_DUE_FILTERS = ["overdue", "today", "this_week", "none"] as const;
type DueFilter = (typeof VALID_DUE_FILTERS)[number];

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;

  const filters: TaskFilters = {};
  const employee_id = sp.get("employee_id");
  if (employee_id) filters.employee_id = employee_id;
  const project_id = sp.get("project_id");
  if (project_id) filters.project_id = project_id;
  const search = sp.get("search");
  if (search) filters.search = search;
  const statusRaw = sp.get("status");
  if (statusRaw) {
    filters.status = statusRaw as TaskStatus;
  }
  const priorityRaw = sp.get("priority");
  if (priorityRaw && VALID_PRIORITIES.includes(priorityRaw as TaskPriority)) {
    filters.priority = priorityRaw as TaskPriority;
  }
  const milestoneRaw = sp.get("milestone_id");
  if (milestoneRaw === "__none__") {
    filters.milestone_id = null;
  } else if (milestoneRaw) {
    filters.milestone_id = milestoneRaw;
  }
  const dueRaw = sp.get("due");
  if (dueRaw && (VALID_DUE_FILTERS as readonly string[]).includes(dueRaw)) {
    const v = dueRaw as DueFilter;
    if (v === "none") filters.due_status = "no_due";
    else if (v === "overdue") filters.due_status = "overdue";
    else if (v === "today") filters.due_status = "today";
    else if (v === "this_week") filters.due_status = "this_week";
  }

  const tasks: TaskRow[] = listAllTasks(filters);
  return Response.json({ tasks });
}

type CreateBody = {
  title?: unknown;
  project_id?: unknown;
  employee_id?: unknown;
  status?: unknown;
  priority?: unknown;
  description?: unknown;
  milestone_id?: unknown;
  due_date?: unknown;
  /**
   * Reject if present — cron rows go through /api/scheduled-runs after the
   * cron-split migration. Kept in the type so the check below can fire a
   * clear error rather than silently dropping the field.
   */
  schedule_cron?: unknown;
};

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v.trim();
}

function parseDateInput(v: unknown): number | null | "__bad__" {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const d = new Date(trimmed);
    if (Number.isFinite(d.getTime())) return d.getTime();
  }
  return "__bad__";
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

  // Cron-split guard: the `tasks` table no longer stores cron rows.
  if ("schedule_cron" in body && body.schedule_cron !== null) {
    return badRequest(
      "schedule_cron is no longer accepted here — use /api/scheduled-runs",
    );
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("title (non-empty string) required");
  }

  let status: TaskStatus = "todo";
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !VALID_KANBAN_STATUSES.includes(body.status as TaskStatus)
    ) {
      return badRequest(
        `status must be one of ${VALID_KANBAN_STATUSES.join(", ")}`,
      );
    }
    status = body.status as TaskStatus;
  }

  let priority: TaskPriority = "medium";
  if (body.priority !== undefined) {
    if (
      typeof body.priority !== "string" ||
      !VALID_PRIORITIES.includes(body.priority as TaskPriority)
    ) {
      return badRequest(
        `priority must be one of ${VALID_PRIORITIES.join(", ")}`,
      );
    }
    priority = body.priority as TaskPriority;
  }

  // Slug-based id so URLs / logs stay readable. Collide → append a short
  // random suffix.
  let id = slugify(body.title);
  while (getTask(id)) {
    id = `${slugify(body.title)}-${randomUUID().slice(0, 4)}`;
  }

  const milestone_id = strOrNull(body.milestone_id);
  const due_date = parseDateInput(body.due_date);
  if (due_date === "__bad__") return badRequest("due_date must be number|string|null");

  const task = insertTask({
    id,
    title: body.title.trim(),
    employee_id: strOrNull(body.employee_id),
    project_id: strOrNull(body.project_id),
    description: strOrNull(body.description),
    priority,
    status,
    milestone_id,
    due_date,
  });
  return Response.json({ task }, { status: 201 });
}
