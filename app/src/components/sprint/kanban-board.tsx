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
import {
  ArrowRight,
  Calendar,
  Check,
  ClipboardList,
  Pencil,
  Plus,
  Repeat,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { useProjects } from "@/lib/hooks/use-projects";
import { AddTaskModal } from "@/components/tasks/add-task-modal";

// Work tasks. Cron-fired runs moved to `scheduled_runs` post-cron-split;
// this board reads work items only.
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "archived";

export type TaskRecurrence = "daily" | "weekdays" | "weekly" | "monthly";

export type TaskRow = {
  id: string;
  title: string;
  employee_id: string | null;
  skill: string | null;
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  description: string | null;
  created_at: number | null;
  playbook: string | null;
  project_id: string | null;
  milestone_id: string | null;
  due_date: number | null;
  recurrence: TaskRecurrence | null;
  recurrence_anchor: number | null;
  parent_task_id: string | null;
};

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
  /** Filter the board to a single project. `null`/undefined = all projects. */
  projectId?: string | null;
  /** Human label used by the smart empty state when a project filter is set. */
  projectName?: string | null;
  /** Filter the board to a single milestone. Only honoured with a project. */
  milestoneId?: string | null;
  /**
   * Pre-baked deadline bucket. Server accepts overdue|today|this_week|none —
   * matches the URL `?due=…` param on /tasks. `null`/undefined = no filter.
   */
  due?: "overdue" | "today" | "this_week" | "none" | null;
  /** Display lookup so cards can render `milestone.name` from `milestone_id`. */
  milestoneNamesById?: Record<string, string>;
  onCountsChange?: (counts: KanbanCounts) => void;
  /**
   * Increment to force a refetch — used by the parent's "Add Task" flow to
   * pull the new row in without waiting for a poll.
   */
  refreshKey?: number;
};

export function KanbanBoard({
  projectId = null,
  projectName = null,
  milestoneId = null,
  due = null,
  milestoneNamesById,
  onCountsChange,
  refreshKey = 0,
}: KanbanBoardProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spawnToast, setSpawnToast] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const { employees } = useEmployees();
  const { projects } = useProjects();

  const refresh = useCallback(async () => {
    try {
      // Server already supports project_id filter (see /api/tasks GET) — use
      // it so the wire payload stays small when a project is selected.
      const sp = new URLSearchParams();
      if (projectId) sp.set("project_id", projectId);
      if (milestoneId) sp.set("milestone_id", milestoneId);
      if (due) sp.set("due", due);
      const qs = sp.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
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
  }, [projectId, milestoneId, due]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

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
        const data = (await res.json().catch(() => null)) as
          | { task?: TaskRow; spawned?: TaskRow | null }
          | null;
        if (data?.spawned) {
          const spawned = data.spawned;
          // Prepend the new instance to local state so the next render shows
          // it in the Todo column without waiting for a poll.
          setTasks((prev) => {
            if (prev.some((t) => t.id === spawned.id)) return prev;
            return [spawned, ...prev];
          });
          setSpawnToast(formatSpawnToast(spawned.due_date));
        }
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

  // Auto-dismiss the spawn toast after a beat.
  useEffect(() => {
    if (!spawnToast) return;
    const id = setTimeout(() => setSpawnToast(null), 4500);
    return () => clearTimeout(id);
  }, [spawnToast]);

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
        Loading tasks…
      </div>
    );
  }

  const hasFilter = Boolean(milestoneId) || Boolean(due);

  if (!loading && tasks.length === 0) {
    return (
      <EmptyState
        projectId={projectId}
        projectName={projectName}
        hasFilter={hasFilter}
      />
    );
  }

  return (
    <>
      {error ? (
        <div className="mb-3 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-[11px] text-status-error">
          {error}
        </div>
      ) : null}
      {spawnToast ? (
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-strong bg-white px-3 py-1.5 text-[11px] font-medium text-secondary shadow-sm">
          <Repeat size={12} className="text-accent" />
          {spawnToast}
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
              milestoneNamesById={milestoneNamesById}
              onEdit={setEditTask}
            />
          ))}
        </div>
      </DndContext>
      <AddTaskModal
        open={editTask !== null}
        projects={projects}
        employees={employees}
        task={editTask}
        onClose={() => setEditTask(null)}
        onCreated={() => {
          setEditTask(null);
          void refresh();
        }}
      />
    </>
  );
}

function formatSpawnToast(dueDate: number | null): string {
  if (dueDate === null) return "Created next instance";
  const d = new Date(dueDate);
  if (!Number.isFinite(d.getTime())) return "Created next instance";
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `Created next: ${label}`;
}

function Column({
  id,
  label,
  tasks,
  milestoneNamesById,
  onEdit,
}: {
  id: KanbanStatus;
  label: string;
  tasks: TaskRow[];
  milestoneNamesById?: Record<string, string>;
  onEdit: (task: TaskRow) => void;
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
          tasks.map((t) => (
            <KanbanCard
              key={t.id}
              task={t}
              milestoneNamesById={milestoneNamesById}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}

const RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

function KanbanCard({
  task,
  milestoneNamesById,
  onEdit,
}: {
  task: TaskRow;
  milestoneNamesById?: Record<string, string>;
  onEdit: (task: TaskRow) => void;
}) {
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const owner = task.employee_id
    ? employees.find((e) => e.id === task.employee_id)
    : null;
  const project = task.project_id
    ? projects.find((p) => p.id === task.project_id)
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
  const due = task.due_date != null ? dueLabel(task.due_date) : null;
  const milestoneName = task.milestone_id
    ? milestoneNamesById?.[task.milestone_id] ?? null
    : null;

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
          <div className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-primary">
            <span className="min-w-0 flex-1">{task.title}</span>
            {task.recurrence ? (
              <span
                className="mt-0.5 inline-flex shrink-0 text-muted"
                title={`Repeats: ${RECURRENCE_LABEL[task.recurrence]}`}
                aria-label={`Repeats: ${RECURRENCE_LABEL[task.recurrence]}`}
              >
                <Repeat size={11} />
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {project ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border bg-white px-1.5 py-0.5 text-[9px] font-medium"
                style={{
                  borderColor: (project.color ?? "#5B5BD6") + "40",
                  color: project.color ?? "#5B5BD6",
                }}
                title={project.name}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: project.color ?? "#5B5BD6" }}
                />
                <span className="truncate">{project.name}</span>
              </span>
            ) : null}
            {task.playbook ?? task.skill ? (
              <span className="inline-flex rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium text-secondary">
                {task.playbook ?? task.skill}
              </span>
            ) : null}
          </div>
          {due || milestoneName ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {due ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ background: due.bg, color: due.fg }}
                  title={`Due ${new Date(task.due_date as number).toLocaleDateString()}`}
                >
                  <Calendar size={9} />
                  {due.label}
                </span>
              ) : null}
              {milestoneName ? (
                <span
                  className="inline-flex max-w-[140px] items-center rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium text-secondary"
                  title={milestoneName}
                >
                  <span className="truncate">{milestoneName}</span>
                </span>
              ) : null}
            </div>
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
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => {
              // Stop dnd-kit from interpreting this click as the start of a
              // drag — the card itself is the drag handle.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            title="Edit task"
            aria-label="Edit task"
            className="inline-flex size-5 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-primary"
          >
            <Pencil size={10} />
          </button>
          {owner ? (
            <Avatar initials={owner.initials} color={owner.accent} size={18} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function dueLabel(ms: number): { label: string; bg: string; fg: string } {
  const diff = ms - Date.now();
  const day = 86_400_000;
  if (diff < -day) {
    return {
      label: `Overdue ${Math.abs(Math.floor(diff / day))}d`,
      bg: "#FEE2E2",
      fg: "#B91C1C",
    };
  }
  if (diff < 0) return { label: "Overdue today", bg: "#FEE2E2", fg: "#B91C1C" };
  if (diff < day) return { label: "Due today", bg: "#FEF3C7", fg: "#B45309" };
  if (diff < 2 * day) return { label: "Due tomorrow", bg: "#FEF3C7", fg: "#B45309" };
  if (diff < 7 * day) {
    const d = new Date(ms);
    return {
      label: `Due ${d.toLocaleDateString(undefined, { weekday: "short" })}`,
      bg: "#FEF3C7",
      fg: "#B45309",
    };
  }
  if (diff < 14 * day) return { label: "Due in 2 weeks", bg: "#D1FAE5", fg: "#047857" };
  const d = new Date(ms);
  return {
    label: `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    bg: "#D1FAE5",
    fg: "#047857",
  };
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

function EmptyState({
  projectId,
  projectName,
  hasFilter,
}: {
  projectId: string | null;
  projectName: string | null;
  hasFilter: boolean;
}) {
  // Filter-driven empty state — let the user clear filters rather than
  // assume the project itself is empty.
  if (hasFilter) {
    return (
      <div className="card-surface flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
          <ClipboardList size={22} />
        </span>
        <div className="mt-4 text-sm font-semibold text-primary">
          No tasks match these filters
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted">
          Adjust the milestone or due-date filter to see more tasks.
        </p>
      </div>
    );
  }
  // Scoped to a specific project — point the user back to that project so
  // they can promote items from its backlog instead of creating a new one.
  if (projectId) {
    const name = projectName ?? "this project";
    return (
      <div className="card-surface flex flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
          <ClipboardList size={22} />
        </span>
        <div className="mt-4 text-sm font-semibold text-primary">
          No active tasks in {name}
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted">
          Promote items from this project&rsquo;s tasks to track them here.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <Link
            href={`/projects/${encodeURIComponent(projectId)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <ArrowRight size={12} />
            Open {name}
          </Link>
        </div>
      </div>
    );
  }

  // Global empty state — no project filter and no tasks anywhere.
  return (
    <div className="card-surface flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
        <ClipboardList size={22} />
      </span>
      <div className="mt-4 text-sm font-semibold text-primary">
        No active tasks
      </div>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted">
        Tasks live inside projects. Create a project, add tasks to it, then
        promote them here to track progress as they move through your
        workflow.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus size={12} />
          Create a project
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-muted"
        >
          <ArrowRight size={12} />
          Open Projects
        </Link>
      </div>
    </div>
  );
}
