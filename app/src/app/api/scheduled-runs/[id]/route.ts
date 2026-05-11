/**
 * PATCH  /api/scheduled-runs/[id]
 *   body: partial of {
 *     employee_id, skill, playbook, schedule_cron, human_label, enabled
 *   }
 *   → { scheduled_run }
 *
 *   Validates `schedule_cron` via node-cron when present.
 *   Returns 404 if `id` is unknown, 400 on bad cron / bad body shape.
 *
 * DELETE /api/scheduled-runs/[id]
 *   → { ok: true }
 *
 *   Hard-deletes the row. The in-process cron scheduler's 30s sync loop
 *   drops the registered job automatically.
 */
import nodeCron from "node-cron";
import {
  deleteScheduledRun,
  getScheduledRun,
  updateScheduledRun,
  type UpdateScheduledRunPatch,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function notFound(id: string): Response {
  return Response.json(
    { error: `scheduled_run '${id}' not found` },
    { status: 404 },
  );
}

type PatchBody = {
  employee_id?: unknown;
  skill?: unknown;
  playbook?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
  enabled?: unknown;
};

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v.trim();
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const row = getScheduledRun(id);
  if (!row) return notFound(id);
  return Response.json({ scheduled_run: row });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getScheduledRun(id)) return notFound(id);

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest("body must be an object");
  }

  const patch: UpdateScheduledRunPatch = {};

  if ("employee_id" in body) {
    if (typeof body.employee_id !== "string" || !body.employee_id.trim()) {
      return badRequest("employee_id must be a non-empty string");
    }
    patch.employee_id = body.employee_id.trim();
  }
  if ("skill" in body) {
    if (body.skill !== null && typeof body.skill !== "string") {
      return badRequest("skill must be a string or null");
    }
    patch.skill = strOrNull(body.skill);
  }
  if ("playbook" in body) {
    if (body.playbook !== null && typeof body.playbook !== "string") {
      return badRequest("playbook must be a string or null");
    }
    patch.playbook = strOrNull(body.playbook);
  }
  if ("schedule_cron" in body) {
    if (typeof body.schedule_cron !== "string" || !body.schedule_cron.trim()) {
      return badRequest("schedule_cron must be a non-empty string");
    }
    const next = body.schedule_cron.trim();
    if (!nodeCron.validate(next)) {
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
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return badRequest("enabled must be a boolean");
    }
    patch.enabled = body.enabled;
  }

  const scheduled_run = updateScheduledRun(id, patch);
  if (!scheduled_run) return notFound(id);
  return Response.json({ scheduled_run });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getScheduledRun(id)) return notFound(id);
  const ok = deleteScheduledRun(id);
  if (!ok) return notFound(id);
  return Response.json({ ok: true });
}
