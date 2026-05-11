/**
 * Cron scheduler for autonomous scheduled runs.
 *
 * Sync loop (every 30s):
 *   - Pulls all enabled rows from `scheduled_runs` with employee_id + skill.
 *   - Registers a node-cron job for any new run IDs.
 *   - Stops + drops jobs whose backing row was disabled or removed.
 *
 * Each fire calls `startRun({...})` and patches `last_run_id` / `last_run_at`
 * on the scheduled_runs row. Errors are logged, never thrown — a misbehaving
 * cron must not take down the scheduler.
 *
 * Idempotent boot via globalThis.__gaia_cron_started__.
 */
import nodeCron, { type ScheduledTask } from "node-cron";

import { startRun } from "./agent-runner.ts";
import {
  listScheduledRuns,
  updateScheduledRun,
  type ScheduledRunRow,
} from "./db.ts";

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

function isFireableRun(t: ScheduledRunRow): boolean {
  return Boolean(
    t.enabled &&
      t.schedule_cron &&
      t.schedule_cron.trim() &&
      t.employee_id &&
      t.skill,
  );
}

function syncSchedules(): void {
  let runs: ScheduledRunRow[];
  try {
    runs = listScheduledRuns().filter(isFireableRun);
  } catch (err) {
    console.error("[cron] listScheduledRuns failed", err);
    return;
  }

  const liveIds = new Set(runs.map((t) => t.id));

  // Add or replace jobs whose cron expression has changed.
  for (const run of runs) {
    const existing = _jobs.get(run.id);
    if (existing && existing.cron === run.schedule_cron) continue;

    if (!nodeCron.validate(run.schedule_cron)) {
      if (existing) {
        try {
          void existing.job.stop();
        } catch {
          // ignore
        }
        _jobs.delete(run.id);
      }
      console.warn(
        "[cron] invalid expression — skipping",
        run.id,
        run.schedule_cron,
      );
      continue;
    }

    if (existing) {
      try {
        void existing.job.stop();
      } catch {
        // ignore
      }
      _jobs.delete(run.id);
    }

    try {
      const job = nodeCron.schedule(
        run.schedule_cron,
        async () => {
          try {
            const { runId } = await startRun({
              employeeId: run.employee_id,
              skill: run.skill!,
              input: `Scheduled run: ${run.human_label ?? run.id}`,
            });
            updateScheduledRun(run.id, {
              last_run_id: runId,
              last_run_at: Date.now(),
            });
          } catch (err) {
            console.error("[cron] run failed", run.id, err);
          }
        },
        { name: `gaia-task-${run.id}` },
      );
      _jobs.set(run.id, { job, cron: run.schedule_cron });
    } catch (err) {
      console.error("[cron] schedule failed", run.id, err);
    }
  }

  // Stop jobs whose runs were disabled / removed.
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
