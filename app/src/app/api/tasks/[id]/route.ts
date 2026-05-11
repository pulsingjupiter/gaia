/**
 * PATCH  /api/tasks/[id]
 *   body: partial of {
 *     title, employee_id, project_id, priority, status, description
 *   }
 *   → { task }
 *
 *   Cron fields (`schedule_cron`, `human_label`, `skill`, `enabled`) are
 *   rejected here after the cron-split migration — those belong on
 *   /api/scheduled-runs/[id].
 *
 * DELETE /api/tasks/[id]
 *   → { ok: true }
 *
 *   Hard-deletes the work task row. (Soft-archive available via
 *   PATCH { status: 'archived' }.)
 */
import {
  VALID_RECURRENCES,
  deleteTask,
  getTask,
  spawnNextRecurringInstance,
  updateTask,
  type TaskPriority,
  type TaskRecurrence,
  type TaskRow,
  type TaskStatus,
  type UpdateTaskPatch,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function notFound(id: string): Response {
  return Response.json({ error: `task '${id}' not found` }, { status: 404 });
}

const PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"] as const;
const STATUSES: readonly TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "archived",
] as const;

type PatchBody = {
  title?: unknown;
  employee_id?: unknown;
  project_id?: unknown;
  priority?: unknown;
  status?: unknown;
  description?: unknown;
  milestone_id?: unknown;
  due_date?: unknown;
  recurrence?: unknown;
  recurrence_anchor?: unknown;
  /** Reject these — cron fields belong on /api/scheduled-runs/[id]. */
  schedule_cron?: unknown;
  skill?: unknown;
  human_label?: unknown;
  enabled?: unknown;
};

function strOrNull(v: unknown): string | null {
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

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getTask(id)) return notFound(id);

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest("body must be an object");
  }

  // Cron-split guard — reject any field that the cron-runs endpoint owns.
  for (const cronField of ["schedule_cron", "skill", "human_label", "enabled"]) {
    if (cronField in body && (body as Record<string, unknown>)[cronField] !== null) {
      return badRequest(
        `'${cronField}' is no longer accepted here — use /api/scheduled-runs/${id}`,
      );
    }
  }

  const patch: UpdateTaskPatch = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return badRequest("title must be a non-empty string");
    }
    patch.title = body.title.trim();
  }
  if ("employee_id" in body) {
    if (body.employee_id !== null && typeof body.employee_id !== "string") {
      return badRequest("employee_id must be a string or null");
    }
    patch.employee_id = strOrNull(body.employee_id);
  }
  if ("project_id" in body) {
    if (body.project_id !== null && typeof body.project_id !== "string") {
      return badRequest("project_id must be a string or null");
    }
    patch.project_id = strOrNull(body.project_id);
  }
  if ("priority" in body) {
    if (
      typeof body.priority !== "string" ||
      !PRIORITIES.includes(body.priority as TaskPriority)
    ) {
      return badRequest(`priority must be one of ${PRIORITIES.join(", ")}`);
    }
    patch.priority = body.priority as TaskPriority;
  }
  if ("status" in body) {
    if (
      typeof body.status !== "string" ||
      !STATUSES.includes(body.status as TaskStatus)
    ) {
      return badRequest(`status must be one of ${STATUSES.join(", ")}`);
    }
    patch.status = body.status as TaskStatus;
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return badRequest("description must be a string or null");
    }
    patch.description = strOrNull(body.description);
  }
  if ("milestone_id" in body) {
    if (body.milestone_id !== null && typeof body.milestone_id !== "string") {
      return badRequest("milestone_id must be a string or null");
    }
    patch.milestone_id = strOrNull(body.milestone_id);
  }
  if ("due_date" in body) {
    const parsed = parseDateInput(body.due_date);
    if (parsed === "__bad__") return badRequest("due_date must be number|string|null");
    patch.due_date = parsed;
  }
  if ("recurrence" in body) {
    if (body.recurrence === null) {
      patch.recurrence = null;
    } else if (
      typeof body.recurrence !== "string" ||
      !(VALID_RECURRENCES as readonly string[]).includes(body.recurrence)
    ) {
      return badRequest(
        `recurrence must be one of ${VALID_RECURRENCES.join(", ")} or null`,
      );
    } else {
      patch.recurrence = body.recurrence as TaskRecurrence;
    }
  }
  if ("recurrence_anchor" in body) {
    const parsed = parseDateInput(body.recurrence_anchor);
    if (parsed === "__bad__")
      return badRequest("recurrence_anchor must be number|string|null");
    patch.recurrence_anchor = parsed;
  }

  // Detect transition to `done` for recurrence spawning. We check BEFORE the
  // update so the pre-image is unambiguous, then trigger the spawn after the
  // update so the parent's final state is what gets read.
  const pre = getTask(id);
  const willTransitionToDone =
    patch.status === "done" && pre && pre.status !== "done";

  const task = updateTask(id, patch);
  if (!task) return notFound(id);

  let spawned: TaskRow | null = null;
  if (willTransitionToDone && task.recurrence) {
    try {
      spawned = spawnNextRecurringInstance(id);
    } catch (err) {
      // Don't fail the PATCH if the spawn itself blows up — log and move on.
      console.error(`[recurrence] spawn failed for task ${id}:`, err);
    }
  }

  return Response.json({ task, spawned });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getTask(id)) return notFound(id);
  const ok = deleteTask(id);
  if (!ok) return notFound(id);
  return Response.json({ ok: true });
}
