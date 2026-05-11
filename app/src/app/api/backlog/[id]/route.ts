/**
 * PATCH  /api/backlog/[id]  → partial update, returns { task }
 * DELETE /api/backlog/[id]  → hard delete (row removed from tasks table).
 *                             For soft-archive use PATCH with { status: 'archived' }.
 *
 * Wave 1.
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

const VALID_PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low"];
const VALID_STATUSES: readonly TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "archived",
];

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

type PatchBody = {
  title?: unknown;
  description?: unknown;
  employee_id?: unknown;
  skill?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
  enabled?: unknown;
  priority?: unknown;
  status?: unknown;
  playbook?: unknown;
  milestone_id?: unknown;
  due_date?: unknown;
  recurrence?: unknown;
  recurrence_anchor?: unknown;
};

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
  const existing = getTask(id);
  if (!existing) {
    return Response.json({ error: `task '${id}' not found` }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");

  const patch: UpdateTaskPatch = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return badRequest("title must be non-empty string");
    }
    patch.title = body.title.trim();
  }

  const nullableStrFields = [
    "description",
    "employee_id",
    "skill",
    "schedule_cron",
    "human_label",
    "playbook",
  ] as const;
  for (const field of nullableStrFields) {
    if (field in body) {
      const v = (body as Record<string, unknown>)[field];
      if (v !== null && typeof v !== "string") {
        return badRequest(`'${field}' must be string|null`);
      }
      (patch as Record<string, unknown>)[field] = v;
    }
  }

  if ("priority" in body) {
    if (
      typeof body.priority !== "string" ||
      !(VALID_PRIORITIES as readonly string[]).includes(body.priority)
    ) {
      return badRequest("priority must be high|medium|low");
    }
    patch.priority = body.priority as TaskPriority;
  }

  if ("status" in body) {
    if (
      typeof body.status !== "string" ||
      !(VALID_STATUSES as readonly string[]).includes(body.status)
    ) {
      return badRequest(
        "status must be backlog|todo|in_progress|review|done|archived",
      );
    }
    patch.status = body.status as TaskStatus;
  }

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean" && typeof body.enabled !== "number") {
      return badRequest("enabled must be boolean|number");
    }
    patch.enabled = Boolean(body.enabled);
  }

  if ("milestone_id" in body) {
    const v = body.milestone_id;
    if (v !== null && typeof v !== "string") {
      return badRequest("milestone_id must be string|null");
    }
    patch.milestone_id = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
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

  // Recurrence spawn on status → 'done' transition. Capture pre-image first
  // so we don't double-fire when a task that's already done gets patched.
  const willTransitionToDone =
    patch.status === "done" && existing.status !== "done";

  const task = updateTask(id, patch);

  let spawned: TaskRow | null = null;
  if (willTransitionToDone && task?.recurrence) {
    try {
      spawned = spawnNextRecurringInstance(id);
    } catch (err) {
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
  const existing = getTask(id);
  if (!existing) {
    return Response.json({ error: `task '${id}' not found` }, { status: 404 });
  }
  deleteTask(id);
  return Response.json({ ok: true });
}
