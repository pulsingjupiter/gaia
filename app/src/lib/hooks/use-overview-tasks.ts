"use client";
import { useCallback, useEffect, useState } from "react";
import type { TaskRow, TaskPriority } from "@/server/db";

export function useOverviewTasks() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      // The API supports status as a comma-separated list or just one.
      // Looking at the route source, it takes sp.get("status") and sets filters.status.
      // Wait, let's re-read app/src/app/api/tasks/route.ts
      // const statusRaw = sp.get("status");
      // if (statusRaw) { filters.status = statusRaw as TaskStatus; }
      // This looks like it only supports ONE status if it's passed directly to the DB filter.
      // But the instructions say "todo,in_progress,review".
      // Let's check if listAllTasks handles comma-separated.
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tasks: TaskRow[] };

      // Filter for todo, in_progress, review
      const filtered = data.tasks.filter((t) =>
        ["todo", "in_progress", "review"].includes(t.status),
      );

      const sorted = filtered.sort((a, b) => {
        const now = Date.now();
        const aOverdue = a.due_date && a.due_date < now;
        const bOverdue = b.due_date && b.due_date < now;

        // Overdue first
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        // Due date ascending (nulls last)
        if (a.due_date !== b.due_date) {
          if (a.due_date === null) return 1;
          if (b.due_date === null) return -1;
          return a.due_date - b.due_date;
        }

        // Priority high -> medium -> low
        const priorityMap: Record<TaskPriority, number> = {
          high: 0,
          medium: 1,
          low: 2,
        };
        if (a.priority !== b.priority) {
          return priorityMap[a.priority] - priorityMap[b.priority];
        }

        // Created at descending
        return (b.created_at ?? 0) - (a.created_at ?? 0);
      });

      setTasks(sorted.slice(0, 6));
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, refresh: fetchTasks };
}
