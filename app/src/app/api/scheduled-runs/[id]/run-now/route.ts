/**
 * POST /api/scheduled-runs/[id]/run-now  body: {}  → 202 { run_id }
 *
 * Fires a scheduled run immediately, on-demand. Reads `employee_id` and
 * `skill` from the row, delegates to `startRun()` — the same code path the
 * cron scheduler uses — and patches `last_run_id` / `last_run_at` so the
 * Schedule page reflects the manual fire on its next poll. Does NOT await
 * the run's completion; the caller gets its run_id back immediately.
 */
import {
  getEmployee,
  getScheduledRun,
  updateScheduledRun,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { startRun } from "@/server/agent-runner.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;

  const row = getScheduledRun(id);
  if (!row) {
    return Response.json(
      { error: `scheduled_run '${id}' not found` },
      { status: 404 },
    );
  }
  if (!row.skill) {
    return Response.json(
      { error: "scheduled_run is missing skill" },
      { status: 400 },
    );
  }

  const employee = getEmployee(row.employee_id);
  if (!employee) {
    return Response.json(
      { error: `employee '${row.employee_id}' not found` },
      { status: 404 },
    );
  }
  if (employee.id === "system") {
    return Response.json(
      { error: "cannot fire runs against the system pseudo-agent" },
      { status: 400 },
    );
  }

  try {
    const { runId } = await startRun({
      employeeId: row.employee_id,
      skill: row.skill,
      input: `Manual run: ${row.human_label ?? row.id}`,
    });
    updateScheduledRun(row.id, {
      last_run_id: runId,
      last_run_at: Date.now(),
    });
    return Response.json({ run_id: runId }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 400 });
  }
}
