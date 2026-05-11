"use client";
/**
 * useTaskDueSummary — polled aggregate of overdue / due-this-week / in-progress
 * counts. Scoped to a single project when `projectId` is set, otherwise global.
 *
 * Shared by the Overview rail widget, project header status strip, and the
 * sidebar Tasks badge. 60s poll cadence matches the urgency cadence — overdue
 * counts shift on the order of minutes, not seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TaskDueSummary = {
  total: number;
  overdue: number;
  due_this_week: number;
  due_today: number;
  in_progress: number;
};

const EMPTY: TaskDueSummary = {
  total: 0,
  overdue: 0,
  due_this_week: 0,
  due_today: 0,
  in_progress: 0,
};

export type UseTaskDueSummary = {
  summary: TaskDueSummary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_MS = 60_000;

export function useTaskDueSummary(
  projectId?: string | null,
): UseTaskDueSummary {
  const [summary, setSummary] = useState<TaskDueSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const qs = projectId
        ? `?project_id=${encodeURIComponent(projectId)}`
        : "";
      const res = await fetch(`/api/tasks/summary${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/tasks/summary ${res.status}`);
      const data = (await res.json()) as { summary: TaskDueSummary };
      if (cancelled.current) return;
      setSummary({
        total: data.summary?.total ?? 0,
        overdue: data.summary?.overdue ?? 0,
        due_this_week: data.summary?.due_this_week ?? 0,
        due_today: data.summary?.due_today ?? 0,
        in_progress: data.summary?.in_progress ?? 0,
      });
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  return { summary, loading, error, refresh };
}
