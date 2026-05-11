/**
 * PATCH  /api/tasks/[id]
 *   body: partial of {
 *     title, employee_id, skill, schedule_cron, human_label, project_id,
 *     priority, description, enabled
 *   }
 *   → { task }
 *
 *   Validates `schedule_cron` via node-cron's `cron.validate()` when present.
 *   Returns 404 if `id` is unknown, 400 on bad cron / bad body shape.
 *
 * DELETE /api/tasks/[id]
 *   → { ok: true }
 *
 *   Hard-deletes the row (per Wave 1 docs — `deleteTask()` is a hard delete).
 *   The cron scheduler's 30s sync loop drops the registered job automatically.
 *
 * Wave 4 — wires the Schedule page's Edit/Delete row affordances. Toggle stays
 * on its own dedicated route (`/api/tasks/[id]/toggle`).
 */
import nodeCron from "node-cron";
import {
  deleteTask,
  getTask,
  updateTask,
  type TaskPriority,
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

type PatchBody = {
  title?: unknown;
  employee_id?: unknown;
  skill?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
  project_id?: unknown;
  priority?: unknown;
  description?: unknown;
  enabled?: unknown;
};

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v.trim();
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
  if ("skill" in body) {
    if (body.skill !== null && typeof body.skill !== "string") {
      return badRequest("skill must be a string or null");
    }
    patch.skill = strOrNull(body.skill);
  }
  if ("schedule_cron" in body) {
    if (body.schedule_cron !== null && typeof body.schedule_cron !== "string") {
      return badRequest("schedule_cron must be a string or null");
    }
    const next = strOrNull(body.schedule_cron);
    if (next && !nodeCron.validate(next)) {
      return badRequest(`invalid cron expression: '${next}'`);
    }
    patch.schedule_cron = next;
  }
  if ("human_label" in body) {
    if (body.human_label !== null && typeof body.human_label !== "string") {
      return badRequest("human_label must be a string or null");
    }
    patch.human_label = strOrNull(body.human_label);
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
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return badRequest("description must be a string or null");
    }
    patch.description = strOrNull(body.description);
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return badRequest("enabled must be a boolean");
    }
    patch.enabled = body.enabled;
  }

  const task = updateTask(id, patch);
  if (!task) return notFound(id);
  return Response.json({ task });
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
