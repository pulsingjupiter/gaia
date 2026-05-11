/**
 * Cron scheduler for tasks with `schedule_cron`.
 *
 * Sync loop (every 30s):
 *   - Pulls all enabled tasks with a non-empty `schedule_cron` + employee_id +
 *     skill from the DB.
 *   - Registers a node-cron job for any new task IDs.
 *   - Stops + drops jobs whose backing task was disabled or removed.
 *
 * Each fire calls `startRun({...})` and patches `last_run_id` / `last_run_at`
 * on the task row. Errors are logged, never thrown — a misbehaving cron must
 * not take down the scheduler.
 *
 * Idempotent boot via globalThis.__gaia_cron_started__.
 */
import nodeCron, { type ScheduledTask } from "node-cron";

import { startRun } from "./agent-runner.ts";
import { listAllTasks, updateTask, type TaskRow } from "./db.ts";

const GLOBAL_KEY = "__gaia_cron_started__";
type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean };

const SYNC_INTERVAL_MS = 30 * 1000;

type Registered = {
  job: ScheduledTask;
  cron: string;
};

const _jobs = new Map<string, Registered>();
let _syncInterval: ReturnType<typeof setInterval> | null = null;

export function startCronScheduler(): void {
  const _g = globalThis as GlobalWithFlag;
  if (_g[GLOBAL_KEY]) return;
  _g[GLOBAL_KEY] = true;

  syncSchedules();
  _syncInterval = setInterval(syncSchedules, SYNC_INTERVAL_MS);
  console.log("[cron] scheduler started");
}

export function stopCronScheduler(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
  for (const [id, r] of _jobs.entries()) {
    try {
      void r.job.stop();
    } catch {
      // ignore
    }
    _jobs.delete(id);
  }
  const _g = globalThis as GlobalWithFlag;
  _g[GLOBAL_KEY] = false;
}

function isCronTask(t: TaskRow): boolean {
  return Boolean(
    t.enabled &&
      t.schedule_cron &&
      t.schedule_cron.trim() &&
      t.employee_id &&
      t.skill,
  );
}

function syncSchedules(): void {
  let tasks: TaskRow[];
  try {
    tasks = listAllTasks().filter(isCronTask);
  } catch (err) {
    console.error("[cron] listAllTasks failed", err);
    return;
  }

  const liveIds = new Set(tasks.map((t) => t.id));

  // Add or replace jobs whose cron expression has changed.
  for (const task of tasks) {
    const existing = _jobs.get(task.id);
    if (existing && existing.cron === task.schedule_cron) continue;

    if (!nodeCron.validate(task.schedule_cron!)) {
      if (existing) {
        try {
          void existing.job.stop();
        } catch {
          // ignore
        }
        _jobs.delete(task.id);
      }
      console.warn(
        "[cron] invalid expression — skipping",
        task.id,
        task.schedule_cron,
      );
      continue;
    }

    if (existing) {
      try {
        void existing.job.stop();
      } catch {
        // ignore
      }
      _jobs.delete(task.id);
    }

    try {
      const job = nodeCron.schedule(
        task.schedule_cron!,
        async () => {
          try {
            const { runId } = await startRun({
              employeeId: task.employee_id!,
              skill: task.skill!,
              input: `Scheduled run: ${task.title}`,
            });
            updateTask(task.id, {
              last_run_id: runId,
              last_run_at: Date.now(),
            });
          } catch (err) {
            console.error("[cron] run failed", task.id, err);
          }
        },
        { name: `gaia-task-${task.id}` },
      );
      _jobs.set(task.id, { job, cron: task.schedule_cron! });
    } catch (err) {
      console.error("[cron] schedule failed", task.id, err);
    }
  }

  // Stop jobs whose tasks were disabled / removed.
  for (const [id, r] of _jobs.entries()) {
    if (liveIds.has(id)) continue;
    try {
      void r.job.stop();
    } catch {
      // ignore
    }
    _jobs.delete(id);
  }
}

/** Visibility helper for debug routes. */
export function listScheduledJobs(): { task_id: string; cron: string }[] {
  const out: { task_id: string; cron: string }[] = [];
  for (const [id, r] of _jobs.entries()) {
    out.push({ task_id: id, cron: r.cron });
  }
  return out;
}
