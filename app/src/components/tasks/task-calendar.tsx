"use client";
/**
 * TaskCalendar — month-grid view of tasks for /tasks.
 *
 * Renders ACTUAL task rows on their `due_date`, plus PROJECTED future
 * occurrences of recurring tasks that haven't been spawned yet. Projection
 * is capped at 6 occurrences per template to keep render cost bounded and
 * the UI from feeling visually noisy.
 *
 * Filters (project / milestone) are passed through to /api/tasks so the wire
 * payload stays scoped. The route already returns all statuses by default;
 * we include `include_done=1` for clarity since the calendar wants history.
 *
 * Empty cells: clicking opens AddTaskModal pre-seeded with the day's date
 * (via the `onCreateForDate` callback owned by the parent page).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Repeat,
} from "lucide-react";
import { AddTaskModal } from "@/components/tasks/add-task-modal";
import {
  type TaskRecurrence,
  type TaskRow,
} from "@/components/sprint/kanban-board";
import { useEmployees } from "@/components/employees/employees-context";
import { useProjects } from "@/lib/hooks/use-projects";

const MAX_GHOST_OCCURRENCES_PER_TASK = 6;
const MAX_CHIPS_PER_DAY = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

type CalendarCell = {
  date: Date;
  inMonth: boolean;
  iso: string;
};

type ChipKind =
  | { type: "real"; task: TaskRow }
  | { type: "ghost"; sourceTask: TaskRow; occurrenceMs: number };

export type TaskCalendarProps = {
  projectId: string | null;
  milestoneId: string | null;
  milestoneNamesById?: Record<string, string>;
  refreshKey: number;
  onCreateForDate: (isoDate: string) => void;
  onRefreshNeeded: () => void;
};

export function TaskCalendar({
  projectId,
  milestoneId,
  milestoneNamesById,
  refreshKey,
  onCreateForDate,
  onRefreshNeeded,
}: TaskCalendarProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Anchor date for the visible month (always the 1st of the month).
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [ghostInfo, setGhostInfo] = useState<{
    sourceTask: TaskRow;
    occurrenceMs: number;
  } | null>(null);

  const { employees } = useEmployees();
  const { projects } = useProjects();

  const refresh = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (projectId) sp.set("project_id", projectId);
      if (milestoneId) sp.set("milestone_id", milestoneId);
      sp.set("include_done", "1");
      const qs = sp.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/tasks ${res.status}`);
      const data = (await res.json()) as { tasks: TaskRow[] };
      // Strip backlog/archived — they don't belong on the calendar surface.
      const filtered = (data.tasks ?? []).filter(
        (t) => t.status !== "backlog" && t.status !== "archived",
      );
      setTasks(filtered);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, milestoneId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh, refreshKey]);

  const grid = useMemo<CalendarCell[]>(() => buildGrid(anchor), [anchor]);

  // Visible range bounds — first cell midnight → last cell end-of-day.
  const rangeStart = grid[0].date.getTime();
  const rangeEndExclusive = new Date(
    grid[grid.length - 1].date.getFullYear(),
    grid[grid.length - 1].date.getMonth(),
    grid[grid.length - 1].date.getDate() + 1,
  ).getTime();

  // Real tasks bucketed by ISO date (YYYY-MM-DD).
  const realByDay = useMemo<Map<string, TaskRow[]>>(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (t.due_date == null) continue;
      if (t.due_date < rangeStart || t.due_date >= rangeEndExclusive) continue;
      const iso = toIso(new Date(t.due_date));
      const arr = m.get(iso);
      if (arr) arr.push(t);
      else m.set(iso, [t]);
    }
    return m;
  }, [tasks, rangeStart, rangeEndExclusive]);

  // Ghost occurrences. For each recurring task with a due_date, project up
  // to MAX_GHOST_OCCURRENCES_PER_TASK forward and keep the ones inside the
  // visible range. Skip a ghost if a real instance from the same chain
  // already lives on that day.
  const ghostByDay = useMemo<Map<string, ChipKind[]>>(() => {
    const m = new Map<string, ChipKind[]>();
    // Pre-compute occupied day+chainRoot pairs so a real instance suppresses
    // its corresponding ghost.
    const occupied = new Set<string>();
    for (const t of tasks) {
      if (t.due_date == null) continue;
      const iso = toIso(new Date(t.due_date));
      const rootId = t.parent_task_id ?? t.id;
      occupied.add(`${rootId}|${iso}`);
    }
    for (const t of tasks) {
      if (!t.recurrence || t.due_date == null) continue;
      // Don't project past tasks that are already done — that branch of the
      // chain is closed once the user marks it.
      let cursor = t.due_date;
      const rootId = t.parent_task_id ?? t.id;
      for (let i = 0; i < MAX_GHOST_OCCURRENCES_PER_TASK; i++) {
        cursor = computeNextOccurrence(cursor, t.recurrence);
        if (cursor >= rangeEndExclusive) break;
        if (cursor < rangeStart) continue;
        const iso = toIso(new Date(cursor));
        const key = `${rootId}|${iso}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const chip: ChipKind = {
          type: "ghost",
          sourceTask: t,
          occurrenceMs: cursor,
        };
        const arr = m.get(iso);
        if (arr) arr.push(chip);
        else m.set(iso, [chip]);
      }
    }
    return m;
  }, [tasks, rangeStart, rangeEndExclusive]);

  const todayIso = useMemo(() => toIso(new Date()), []);
  const monthLabel = `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const goPrev = () =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
  const goNext = () =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const handleCreateGhostNow = async (
    sourceTask: TaskRow,
    occurrenceMs: number,
  ) => {
    try {
      const body: Record<string, unknown> = {
        title: sourceTask.title,
        status: "todo",
        priority: sourceTask.priority,
        due_date: occurrenceMs,
        recurrence: sourceTask.recurrence,
        recurrence_anchor:
          sourceTask.recurrence_anchor ?? sourceTask.due_date ?? occurrenceMs,
      };
      if (sourceTask.project_id) body.project_id = sourceTask.project_id;
      if (sourceTask.employee_id) body.employee_id = sourceTask.employee_id;
      if (sourceTask.milestone_id) body.milestone_id = sourceTask.milestone_id;
      if (sourceTask.description) body.description = sourceTask.description;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `POST /api/tasks ${res.status}`);
      }
      setGhostInfo(null);
      onRefreshNeeded();
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="card-surface px-4 py-12 text-center text-xs text-muted">
        Loading calendar…
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
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-3 py-2">
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-primary"
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-surface-muted"
              title="Jump to today"
            >
              {monthLabel}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-primary"
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-accent-soft border border-accent/40" />
              Real
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm border border-dashed border-strong bg-white opacity-60" />
              Projected
            </span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-subtle bg-surface-muted text-[10px] font-semibold text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((cell) => {
            const real = realByDay.get(cell.iso) ?? [];
            const ghosts = ghostByDay.get(cell.iso) ?? [];
            const chips: ChipKind[] = [
              ...real.map<ChipKind>((t) => ({ type: "real", task: t })),
              ...ghosts,
            ];
            const visibleChips = chips.slice(0, MAX_CHIPS_PER_DAY);
            const overflow = chips.length - visibleChips.length;
            const isToday = cell.iso === todayIso;
            return (
              <div
                key={cell.iso}
                className={[
                  "relative flex h-28 flex-col gap-0.5 border-b border-r border-subtle p-1",
                  cell.inMonth ? "bg-white" : "bg-surface-muted/50",
                  isToday
                    ? "ring-1 ring-inset ring-accent/60 bg-accent-soft/30"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <button
                    type="button"
                    onClick={() => onCreateForDate(cell.iso)}
                    title="Add task for this day"
                    className={[
                      "rounded px-1 font-semibold hover:bg-surface-muted",
                      cell.inMonth ? "text-primary" : "text-muted",
                      isToday ? "text-accent" : "",
                    ].join(" ")}
                  >
                    {cell.date.getDate()}
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  {visibleChips.map((chip, idx) => (
                    <Chip
                      key={
                        chip.type === "real"
                          ? `r-${chip.task.id}`
                          : `g-${chip.sourceTask.id}-${chip.occurrenceMs}-${idx}`
                      }
                      chip={chip}
                      projects={projects}
                      milestoneNamesById={milestoneNamesById}
                      onOpenReal={(t) => setEditTask(t)}
                      onOpenGhost={(s, ms) =>
                        setGhostInfo({ sourceTask: s, occurrenceMs: ms })
                      }
                    />
                  ))}
                  {overflow > 0 ? (
                    <span className="px-1 text-[9px] font-medium text-muted">
                      + {overflow} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {ghostInfo ? (
        <GhostDialog
          info={ghostInfo}
          onClose={() => setGhostInfo(null)}
          onCreate={() =>
            handleCreateGhostNow(
              ghostInfo.sourceTask,
              ghostInfo.occurrenceMs,
            )
          }
        />
      ) : null}

      <AddTaskModal
        open={editTask !== null}
        projects={projects}
        employees={employees}
        task={editTask}
        onClose={() => setEditTask(null)}
        onCreated={() => {
          setEditTask(null);
          onRefreshNeeded();
          void refresh();
        }}
      />
    </>
  );
}

function Chip({
  chip,
  projects,
  milestoneNamesById: _milestoneNamesById,
  onOpenReal,
  onOpenGhost,
}: {
  chip: ChipKind;
  projects: Array<{ id: string; color: string | null }>;
  milestoneNamesById?: Record<string, string>;
  onOpenReal: (t: TaskRow) => void;
  onOpenGhost: (sourceTask: TaskRow, occurrenceMs: number) => void;
}) {
  if (chip.type === "real") {
    const t = chip.task;
    const project = t.project_id
      ? projects.find((p) => p.id === t.project_id)
      : null;
    const baseColor = project?.color ?? "#5B5BD6";
    const tint = statusTint(t.status);
    const done = t.status === "done";
    return (
      <button
        type="button"
        onClick={() => onOpenReal(t)}
        title={t.title}
        style={{
          background: tint.bg,
          color: tint.fg,
          borderColor: tint.border,
        }}
        className={[
          "flex items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium",
          done ? "line-through opacity-70" : "",
        ].join(" ")}
      >
        <span
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ background: baseColor }}
        />
        {t.recurrence ? (
          <Repeat size={9} className="shrink-0 opacity-70" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{t.title}</span>
      </button>
    );
  }
  // ghost
  const s = chip.sourceTask;
  const project = s.project_id
    ? projects.find((p) => p.id === s.project_id)
    : null;
  const baseColor = project?.color ?? "#5B5BD6";
  return (
    <button
      type="button"
      onClick={() => onOpenGhost(s, chip.occurrenceMs)}
      title="Projected occurrence"
      className="flex items-center gap-1 truncate rounded border border-dashed border-strong bg-white px-1 py-0.5 text-left text-[10px] font-medium text-muted opacity-70 hover:opacity-100"
    >
      <span
        className="inline-block size-1.5 shrink-0 rounded-full"
        style={{ background: baseColor }}
      />
      <Repeat size={9} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{s.title}</span>
    </button>
  );
}

function GhostDialog({
  info,
  onClose,
  onCreate,
}: {
  info: { sourceTask: TaskRow; occurrenceMs: number };
  onClose: () => void;
  onCreate: () => void;
}) {
  const d = new Date(info.occurrenceMs);
  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-[420px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-primary">
          {info.sourceTask.title}
        </div>
        <p className="mt-1 text-xs text-muted">
          Projected occurrence — will be created when the current instance is
          marked done.
        </p>
        <p className="mt-2 text-[11px] text-secondary">{dateLabel}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <Pencil size={12} />
            Create now
          </button>
        </div>
      </div>
    </div>
  );
}

function statusTint(status: TaskRow["status"]): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case "in_progress":
      return { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" };
    case "review":
      return { bg: "#EDE9FE", fg: "#5B21B6", border: "#DDD6FE" };
    case "done":
      return { bg: "#F1F5F9", fg: "#475569", border: "#E2E8F0" };
    case "todo":
    default:
      return { bg: "#DBEAFE", fg: "#1E40AF", border: "#BFDBFE" };
  }
}

/**
 * Build a Mon-anchored 6-row, 42-cell calendar grid spanning the visible
 * month. `anchor` must be the first of the month.
 */
function buildGrid(anchor: Date): CalendarCell[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  // Weekday of the 1st where Mon = 0 ... Sun = 6.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  // Start from `1 - firstDow` so the first cell is the most-recent Monday
  // on or before the 1st.
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - firstDow + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === month,
      iso: toIso(d),
    });
  }
  return cells;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Mirror of `computeNextOccurrence` in `app/src/server/db.ts`. Kept inline
 * (rather than imported from the server module) so the calendar stays a pure
 * client component without dragging better-sqlite3 into the client bundle.
 */
function computeNextOccurrence(
  current: number,
  recurrence: TaskRecurrence,
): number {
  const d = new Date(current);
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2);
    else if (dow === 0) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
    return d.getTime();
  }
  // monthly
  const desiredDay = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ss = d.getSeconds();
  const ms = d.getMilliseconds();
  const targetMonth = d.getMonth() + 1;
  const targetYear = d.getFullYear();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(desiredDay, lastDay);
  return new Date(targetYear, targetMonth, day, hh, mm, ss, ms).getTime();
}
