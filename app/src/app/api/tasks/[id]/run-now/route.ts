/**
 * POST /api/tasks/[id]/run-now  body: {}  → 202 { run_id }
 *
 * Fires a scheduled task immediately, on-demand. Reads the task's stored
 * `employee_id` and `skill` (must both be populated), looks up the employee,
 * and delegates to `startRun()` — the same code path the cron scheduler uses
 * — so any cost caps / safety rails added there apply here automatically.
 *
 * After kicking off the run we patch `last_run_id` / `last_run_at` so the
 * Schedule page reflects the manual fire on its next poll. We do NOT await
 * `done` — the run executes in the background and the caller gets its run_id
 * back immediately.
 */
import { getEmployee, getTask, updateTask } from "@/server/db.ts";
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

  const task = getTask(id);
  if (!task) {
    return Response.json({ error: `task '${id}' not found` }, { status: 404 });
  }
  if (!task.employee_id || !task.skill) {
    return Response.json(
      { error: "task is missing employee_id or skill" },
      { status: 400 },
    );
  }

  const employee = getEmployee(task.employee_id);
  if (!employee) {
    return Response.json(
      { error: `employee '${task.employee_id}' not found` },
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
      employeeId: task.employee_id,
      skill: task.skill,
      input: `Manual run: ${task.title}`,
      projectId: task.project_id ?? undefined,
    });
    updateTask(task.id, {
      last_run_id: runId,
      last_run_at: Date.now(),
    });
    return Response.json({ run_id: runId }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 400 });
  }
}
