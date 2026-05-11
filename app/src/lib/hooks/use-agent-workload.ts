"use client";
/**
 * useAgentWorkload — aggregate everything an agent is "currently involved
 * with" so the Workload tab can render a single-glance status surface.
 *
 * Five reads per refresh, fired in parallel via Promise.allSettled so a
 * transient failure on one source doesn't blank the rest of the tab:
 *
 *   1. /api/runs?employee_id=…&limit=20    → recent runs (live + history tail)
 *   2. /api/scheduled-runs?enabled=1&…     → enabled cron-fired runs here
 *   3. /api/backlog?employee_id=…          → backlog tasks assigned here
 *   4. /api/approvals?status=pending&…     → pending approvals
 *   5. /api/messages?threads=1             → all threads, filtered to ones
 *                                            this agent participates in with
 *                                            activity in the last 7 days
 *
 * Polls every 10s. Lighter than the 8s conversations poll and the 4s thread
 * poll — the workload view doesn't need second-level latency.
 *
 * `refresh()` is exposed so callers can trigger a re-fetch after a mutation
 * (e.g. resolving an approval) without waiting for the next tick.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { RunRow } from "@/lib/hooks/use-agent-detail";
import type { ScheduledRunRow } from "@/lib/hooks/use-scheduled-runs";
import type { ApprovalRow } from "@/lib/hooks/use-approvals";
import type { ThreadSummary } from "@/lib/hooks/use-conversations";

// Work tasks still live in the `tasks` table; this hook reads them via
// /api/backlog (which already filters status='backlog' by default).
type TaskRow = {
  id: string;
  title: string;
  employee_id: string | null;
  priority: "high" | "medium" | "low";
  status:
    | "backlog"
    | "todo"
    | "in_progress"
    | "review"
    | "done"
    | "archived";
  description: string | null;
  project_id: string | null;
};

const POLL_MS = 10_000;
const ACTIVE_THREAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type UseAgentWorkload = {
  /** Runs currently in 'running' status for this agent. */
  activeRuns: RunRow[];
  /**
   * Timestamp (ms epoch) of the most recent run end across the recent window,
   * or `null` when this agent has never run. Falls back to `started_at` for
   * runs that are still in flight (treated as live activity).
   */
  recentLastActivity: number | null;
  /** Enabled cron-fired scheduled runs owned by this agent. */
  scheduled: ScheduledRunRow[];
  /** Backlog tasks (status='backlog') assigned to this agent. */
  backlog: TaskRow[];
  /** Pending approvals scoped to this agent. */
  pendingApprovals: ApprovalRow[];
  /** user↔agent threads with `last_at` within the last 7 days. */
  activeThreads: ThreadSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`);
  return (await res.json()) as T;
}

export function useAgentWorkload(
  agentId: string | null | undefined,
): UseAgentWorkload {
  const [activeRuns, setActiveRuns] = useState<RunRow[]>([]);
  const [recentLastActivity, setRecentLastActivity] = useState<number | null>(
    null,
  );
  const [scheduled, setScheduled] = useState<ScheduledRunRow[]>([]);
  const [backlog, setBacklog] = useState<TaskRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRow[]>([]);
  const [activeThreads, setActiveThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!agentId) {
      setActiveRuns([]);
      setRecentLastActivity(null);
      setScheduled([]);
      setBacklog([]);
      setPendingApprovals([]);
      setActiveThreads([]);
      setLoading(false);
      return;
    }

    const id = encodeURIComponent(agentId);
    const cutoff = Date.now() - ACTIVE_THREAD_WINDOW_MS;

    const [runsRes, scheduledRes, backlogRes, approvalsRes, threadsRes] =
      await Promise.allSettled([
        getJson<{ runs?: RunRow[] }>(`/api/runs?employee_id=${id}&limit=20`),
        // The /api/scheduled-runs endpoint owns cron-fired autonomy after the
        // cron-split migration. We narrow to enabled rows here so the
        // SCHEDULED card only surfaces autonomy that's actually armed.
        getJson<{ scheduled_runs?: ScheduledRunRow[] }>(
          `/api/scheduled-runs?enabled=1&employee_id=${id}`,
        ),
        getJson<{ tasks?: TaskRow[] }>(`/api/backlog?employee_id=${id}`),
        getJson<{ approvals?: ApprovalRow[] }>(
          `/api/approvals?status=pending&agent_id=${id}`,
        ),
        getJson<{ threads?: ThreadSummary[] }>(`/api/messages?threads=1`),
      ]);

    if (!mounted.current) return;

    // Runs ──────────────────────────────────────────────────────────────────
    if (runsRes.status === "fulfilled") {
      const runs = runsRes.value.runs ?? [];
      const live = runs.filter((r) => r.status === "running");
      setActiveRuns(live);

      // Latest activity = the most recent ended_at (or started_at for runs
      // still in flight). Sorted-DESC by `started_at` already from the API,
      // but be defensive.
      let latest: number | null = null;
      for (const r of runs) {
        const ts = r.ended_at ?? r.started_at;
        if (typeof ts === "number" && Number.isFinite(ts)) {
          if (latest === null || ts > latest) latest = ts;
        }
      }
      setRecentLastActivity(latest);
    }

    // Scheduled (cron) runs ─────────────────────────────────────────────────
    if (scheduledRes.status === "fulfilled") {
      const all = scheduledRes.value.scheduled_runs ?? [];
      setScheduled(
        all.filter(
          (t) =>
            t.employee_id === agentId &&
            typeof t.schedule_cron === "string" &&
            t.schedule_cron.trim() !== "" &&
            t.enabled === 1,
        ),
      );
    }

    // Backlog tasks ─────────────────────────────────────────────────────────
    if (backlogRes.status === "fulfilled") {
      const list = backlogRes.value.tasks ?? [];
      // /api/backlog already filters to status='backlog' by default and to
      // employee_id when the param is set; mirror those guards locally to
      // stay defensive against API shape drift.
      setBacklog(
        list.filter(
          (t) => t.employee_id === agentId && t.status === "backlog",
        ),
      );
    }

    // Pending approvals ─────────────────────────────────────────────────────
    if (approvalsRes.status === "fulfilled") {
      const list = approvalsRes.value.approvals ?? [];
      setPendingApprovals(
        list.filter((a) => a.agent_id === agentId && a.status === "pending"),
      );
    }

    // Active threads (user↔this agent within last 7 days) ───────────────────
    if (threadsRes.status === "fulfilled") {
      const list = threadsRes.value.threads ?? [];
      setActiveThreads(
        list.filter(
          (t) =>
            Array.isArray(t.participants) &&
            t.participants.includes(agentId) &&
            t.participants.includes("user") &&
            typeof t.last_at === "number" &&
            t.last_at >= cutoff,
        ),
      );
    }

    // Surface the first failure (if any) without blocking partial results.
    const firstReject = [
      runsRes,
      scheduledRes,
      backlogRes,
      approvalsRes,
      threadsRes,
    ].find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (firstReject) {
      const reason = firstReject.reason;
      setError(reason instanceof Error ? reason.message : String(reason));
    } else {
      setError(null);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  return {
    activeRuns,
    recentLastActivity,
    scheduled,
    backlog,
    pendingApprovals,
    activeThreads,
    loading,
    error,
    refresh,
  };
}
