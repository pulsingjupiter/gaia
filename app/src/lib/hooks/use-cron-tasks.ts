"use client";
/**
 * useCronTasks — fetches /api/tasks?cron_only=1 with a 30s poll cadence and
 * exposes optimistic mutations (toggle, add) for the Schedule page.
 *
 * The cron scheduler picks up `enabled`/`schedule_cron` changes via its own
 * 30s sync, so client-side optimism is purely a UI nicety — the server is
 * still the source of truth.
 *
 * Wave 4 — `update()` PATCHes `/api/tasks/[id]` and `remove()` DELETEs it.
 * Both refresh the list on success. The cron scheduler's 30s sync loop picks
 * up the resulting changes (re-schedule, unschedule) automatically.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "archived";

export type TaskRow = {
  id: string;
  title: string;
  employee_id: string | null;
  skill: string | null;
  schedule_cron: string | null;
  human_label: string | null;
  enabled: 0 | 1;
  last_run_id: string | null;
  last_run_at: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  description: string | null;
  created_at: number | null;
  playbook: string | null;
  project_id: string | null;
};

export type CreateCronTaskInput = {
  title: string;
  employee_id: string;
  skill: string;
  schedule_cron: string;
  human_label?: string;
  project_id?: string | null;
};

export type UpdateCronTaskInput = Partial<{
  title: string;
  employee_id: string | null;
  skill: string | null;
  schedule_cron: string | null;
  human_label: string | null;
  project_id: string | null;
  priority: TaskPriority;
  description: string | null;
  enabled: boolean;
}>;

export type UseCronTasks = {
  tasks: TaskRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<TaskRow | null>;
  add: (input: CreateCronTaskInput) => Promise<TaskRow | null>;
  update: (id: string, patch: UpdateCronTaskInput) => Promise<TaskRow | null>;
  remove: (id: string) => Promise<boolean>;
  runNow: (id: string) => Promise<{ run_id: string } | null>;
};

const POLL_MS = 30_000;

async function fetchCronTasks(): Promise<TaskRow[]> {
  const res = await fetch("/api/tasks?cron_only=1", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/tasks ${res.status}`);
  const data = (await res.json()) as { tasks: TaskRow[] };
  return data.tasks ?? [];
}

export function useCronTasks(): UseCronTasks {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchCronTasks();
      if (cancelled.current) return;
      setTasks(list);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  const toggle: UseCronTasks["toggle"] = useCallback(async (id, enabled) => {
    // Optimistic flip first — revert on failure.
    const next: 0 | 1 = enabled ? 1 : 0;
    let rolledBackTo: 0 | 1 | null = null;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        rolledBackTo = t.enabled;
        return { ...t, enabled: next };
      }),
    );
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(id)}/toggle`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      if (!res.ok) throw new Error(`POST toggle ${res.status}`);
      const data = (await res.json()) as { task: TaskRow };
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
      return data.task;
    } catch (err) {
      if (rolledBackTo !== null) {
        const prevValue: 0 | 1 = rolledBackTo;
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, enabled: prevValue } : t)),
        );
      }
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const add: UseCronTasks["add"] = useCallback(async (input) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `POST /api/tasks ${res.status}`);
      }
      const data = (await res.json()) as { task: TaskRow };
      setTasks((prev) => {
        // If the row only fits this view when cron is set + scheduled, it
        // will. Always prepend so the latest creation lands at the top.
        const idx = prev.findIndex((t) => t.id === data.task.id);
        if (idx === -1) return [data.task, ...prev];
        const next = [...prev];
        next[idx] = data.task;
        return next;
      });
      return data.task;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const update: UseCronTasks["update"] = useCallback(async (id, patch) => {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `PATCH /api/tasks/${id} ${res.status}`);
      }
      const data = (await res.json()) as { task: TaskRow };
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
      return data.task;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const remove: UseCronTasks["remove"] = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `DELETE /api/tasks/${id} ${res.status}`);
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const runNow: UseCronTasks["runNow"] = useCallback(async (id) => {
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(id)}/run-now`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ?? `POST /api/tasks/${id}/run-now ${res.status}`,
        );
      }
      const data = (await res.json()) as { run_id: string };
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  return { tasks, loading, error, refresh, toggle, add, update, remove, runNow };
}
