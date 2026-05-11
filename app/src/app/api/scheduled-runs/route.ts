/**
 * GET  /api/scheduled-runs?enabled=1&employee_id=
 *      → { scheduled_runs: ScheduledRunRow[] }
 *
 *      Lists rows from the `scheduled_runs` table — the home for cron-fired
 *      autonomous tasks. The cron scheduler reads the same table on its 30s
 *      sync (see `server/cron.ts`).
 *
 * POST /api/scheduled-runs
 *      body: { title, employee_id, skill, schedule_cron, human_label?,
 *              playbook? }
 *      → 201 { scheduled_run }
 *
 *      Cron-fired task creator. `title` is captured into `human_label` so the
 *      /schedule page UI can still surface a friendly name; cron rows do not
 *      have a separate `title` column on this table. Validates the cron
 *      expression via node-cron. Generates a slug-based id from the title.
 *
 * Split out of /api/tasks during the cron-split migration — the `tasks` table
 * is now exclusively for work items (backlog / todo / in_progress / review /
 * done), and these endpoints own everything cron-related.
 */
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import nodeCron from "node-cron";

import {
  getScheduledRun,
  insertScheduledRun,
  listScheduledRuns,
  type ScheduledRunFilters,
  type ScheduledRunRow,
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
      .slice(0, 48) || `run-${randomUUID().slice(0, 8)}`
  );
}

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  return v.trim() === "" ? null : v;
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;

  const filters: ScheduledRunFilters = {};
  const employee_id = sp.get("employee_id");
  if (employee_id) filters.employee_id = employee_id;
  if (sp.get("enabled") === "1") filters.enabled = true;
  if (sp.get("enabled") === "0") filters.enabled = false;

  const scheduled_runs: ScheduledRunRow[] = listScheduledRuns(filters);
  return Response.json({ scheduled_runs });
}

type CreateBody = {
  /** Used to generate the row id and seed `human_label` when no label given. */
  title?: unknown;
  employee_id?: unknown;
  skill?: unknown;
  playbook?: unknown;
  schedule_cron?: unknown;
  human_label?: unknown;
};

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
  const cron = body.schedule_cron.trim();
  if (!nodeCron.validate(cron)) {
    return badRequest(`invalid cron expression: '${cron}'`);
  }

  // Slug-based id so the /schedule page rows stay readable. Collide → append
  // a short random suffix.
  let id = slugify(body.title);
  while (getScheduledRun(id)) {
    id = `${slugify(body.title)}-${randomUUID().slice(0, 4)}`;
  }

  const labelFromBody = strOrNull(body.human_label);
  const scheduled_run = insertScheduledRun({
    id,
    employee_id: body.employee_id.trim(),
    skill: body.skill.trim(),
    playbook: strOrNull(body.playbook),
    schedule_cron: cron,
    human_label: labelFromBody ?? body.title.trim(),
    enabled: 1,
  });
  return Response.json({ scheduled_run }, { status: 201 });
}
