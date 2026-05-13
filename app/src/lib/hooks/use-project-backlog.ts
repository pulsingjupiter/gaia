"use client";
/**
 * useProjectBacklog — backlog tasks scoped to one project.
 *
 * Wraps /api/backlog?project_id=, /api/backlog (POST), /api/backlog/[id]
 * (PATCH/DELETE) and /api/backlog/[id]/promote.
 *
 * All mutations refresh the list from the server (the API returns full rows,
 * but we re-fetch to stay consistent with promote-induced status changes that
 * may move rows out of the backlog query).
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
  milestone_id: string | null;
  due_date: number | null;
};

export type AddTaskInput = {
  title: string;
  description?: string | null;
  employee_id?: string | null;
  priority?: TaskPriority;
  playbook?: string | null;
  milestone_id?: string | null;
  due_date?: number | string | null;
};

export type UpdateTaskInput = Partial<{
  title: string;
  description: string | null;
  employee_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  playbook: string | null;
  milestone_id: string | null;
  due_date: number | string | null;
}>;

export type UseProjectBacklog = {
  tasks: TaskRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (input: AddTaskInput) => Promise<TaskRow | null>;
  update: (id: string, patch: UpdateTaskInput) => Promise<TaskRow | null>;
  remove: (id: string) => Promise<boolean>;
  promote: (id: string) => Promise<TaskRow | null>;
};

export function useProjectBacklog(
  projectId: string | null | undefined,
): UseProjectBacklog {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("project_id", projectId);
      params.set("include_all", "1");
      const res = await fetch(`/api/backlog?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/backlog ${res.status}`);
      const data = (await res.json()) as { tasks: TaskRow[] };
      if (!mounted.current) return;
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const add = useCallback<UseProjectBacklog["add"]>(
    async (input) => {
      if (!projectId) return null;
      try {
        const body = {
          title: input.title,
          description: input.description ?? null,
          employee_id: input.employee_id ?? null,
          priority: input.priority ?? "medium",
          playbook: input.playbook ?? null,
          project_id: projectId,
          milestone_id: input.milestone_id ?? null,
          due_date: input.due_date ?? null,
        };
        const res = await fetch(`/api/backlog`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST /api/backlog ${res.status}`);
        const data = (await res.json()) as { task: TaskRow };
        await refresh();
        return data.task;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [projectId, refresh],
  );

  const update = useCallback<UseProjectBacklog["update"]>(
    async (id, patch) => {
      try {
        const res = await fetch(`/api/backlog/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`PATCH /api/backlog/${id} ${res.status}`);
        const data = (await res.json()) as { task: TaskRow };
        await refresh();
        return data.task;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback<UseProjectBacklog["remove"]>(
    async (id) => {
      try {
        const res = await fetch(`/api/backlog/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`DELETE /api/backlog/${id} ${res.status}`);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [refresh],
  );

  const promote = useCallback<UseProjectBacklog["promote"]>(
    async (id) => {
      try {
        const res = await fetch(
          `/api/backlog/${encodeURIComponent(id)}/promote`,
          { method: "POST" },
        );
        if (!res.ok)
          throw new Error(`POST /api/backlog/${id}/promote ${res.status}`);
        const data = (await res.json()) as { task: TaskRow };
        await refresh();
        return data.task;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [refresh],
  );

  return { tasks, loading, error, refresh, add, update, remove, promote };
}
