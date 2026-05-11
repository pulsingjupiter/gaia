"use client";
/**
 * Sprint kanban board — wired to the live `tasks` table.
 *
 * Fetches `/api/tasks` on mount, drops rows with status `backlog` or
 * `archived` (those belong to project Backlog tabs, not the active sprint),
 * groups by status, and renders four drag-target columns.
 *
 * Dragging a card to a new column fires `PATCH /api/backlog/[id]` with
 * `{ status }`. We update locally first and roll back on error. Empty states
 * are handled per-column AND page-level (when nothing is in flight at all).
 *
 * KPI counts are computed from the same `tasks` array and reported up via
 * `onCountsChange` so the page header can render the strip without a second
 * fetch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { Calendar, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useEmployees } from "@/components/employees/employees-context";
import type { TaskRow, TaskStatus } from "@/lib/hooks/use-cron-tasks";

type KanbanStatus = Extract<
  TaskStatus,
  "todo" | "in_progress" | "review" | "done"
>;

const COLUMNS: { id: KanbanStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const KANBAN_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "todo",
  "in_progress",
  "review",
  "done",
]);

export type KanbanCounts = {
  planned: number;
  inProgress: number;
  review: number;
  completed: number;
};

export type KanbanBoardProps = {
  onCountsChange?: (counts: KanbanCounts) => void;
};

export function KanbanBoard({ onCountsChange }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/tasks ${res.status}`);
      const data = (await res.json()) as { tasks: TaskRow[] };
      const filtered = (data.tasks ?? []).filter((t) =>
        KANBAN_STATUSES.has(t.status),
      );
      setTasks(filtered);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Report counts up so the KPI strip can render without a second fetch.
  useEffect(() => {
    if (!onCountsChange) return;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const review = tasks.filter((t) => t.status === "review").length;
    const completed = tasks.filter((t) => t.status === "done").length;
    onCountsChange({
      planned: tasks.length,
      inProgress,
      review,
      completed,
    });
  }, [tasks, onCountsChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      if (!e.over) return;
      const id = String(e.active.id);
      const target = String(e.over.id) as KanbanStatus;
      if (!KANBAN_STATUSES.has(target)) return;

      // Capture the previous status from the current render's task list — this
      // is fine because dnd-kit only fires drag events when nothing else has
      // mutated state. If the row no longer matches `target`, do nothing.
      let previous: TaskStatus | null = null;
      setTasks((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur || cur.status === target) return prev;
        previous = cur.status;
        return prev.map((t) => (t.id === id ? { ...t, status: target } : t));
      });

      // Defer to next microtask so the setState updater above has run.
      await Promise.resolve();
      if (previous === null) return;
      const rollbackTo: TaskStatus = previous;

      try {
        const res = await fetch(
          `/api/backlog/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: target }),
          },
        );
        if (!res.ok) throw new Error(`PATCH /api/backlog/${id} ${res.status}`);
      } catch (err) {
        // Roll back on error.
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: rollbackTo } : t)),
        );
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const grouped = useMemo(() => {
    const buckets: Record<KanbanStatus, TaskRow[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const t of tasks) {
      if (KANBAN_STATUSES.has(t.status)) {
        buckets[t.status as KanbanStatus].push(t);
      }
    }
    return buckets;
  }, [tasks]);

  if (loading && tasks.length === 0) {
    return (
      <div className="card-surface px-4 py-12 text-center text-xs text-muted">
        Loading sprint tasks…
      </div>
    );
  }

  if (!loading && tasks.length === 0) {
    return (
      <div className="card-surface px-4 py-16 text-center">
        <div className="text-sm font-semibold text-primary">
          No active sprint tasks
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted">
          Promote a task from any project&rsquo;s Backlog tab to start moving
          it through the sprint.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          Open Projects
        </Link>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="mb-3 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-[11px] text-status-error">
          {error}
        </div>
      ) : null}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              tasks={grouped[col.id]}
            />
          ))}
        </div>
      </DndContext>
    </>
  );
}

function Column({
  id,
  label,
  tasks,
}: {
  id: KanbanStatus;
  label: string;
  tasks: TaskRow[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? "rounded-xl bg-accent-soft p-2 transition"
          : "rounded-xl bg-surface-muted p-2 transition"
      }
    >
      <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary">
            {label}
          </span>
          <span className="rounded-full bg-white px-1.5 text-[10px] font-semibold text-secondary">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-strong bg-white/40 px-2 py-3 text-center text-[11px] font-medium text-muted">
            No tasks here yet
          </div>
        ) : (
          tasks.map((t) => <KanbanCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function KanbanCard({ task }: { task: TaskRow }) {
  const { employees } = useEmployees();
  const owner = task.employee_id
    ? employees.find((e) => e.id === task.employee_id)
    : null;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const priorityColor =
    task.priority === "high"
      ? "#EF4444"
      : task.priority === "medium"
        ? "#F59E0B"
        : "#3B82F6";

  const dateLabel = task.created_at ? formatShortDate(task.created_at) : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
      className="card-surface cursor-grab p-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{ background: priorityColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-snug text-primary">
            {task.title}
          </div>
          {task.playbook ?? task.skill ? (
            <span className="mt-1.5 inline-flex rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium text-secondary">
              {task.playbook ?? task.skill}
            </span>
          ) : null}
        </div>
        {task.status === "done" ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-status-online text-white">
            <Check size={10} />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-subtle pt-2 text-[10px] text-muted">
        <div className="inline-flex items-center gap-1">
          {dateLabel ? (
            <>
              <Calendar size={10} />
              {dateLabel}
            </>
          ) : null}
        </div>
        {owner ? (
          <Avatar initials={owner.initials} color={owner.accent} size={18} />
        ) : null}
      </div>
    </div>
  );
}

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
