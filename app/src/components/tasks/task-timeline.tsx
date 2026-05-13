"use client";
/**
 * TaskTimeline — Gantt-style task view for /tasks.
 *
 * Fetches the same active work-task set as the board, excludes backlog and
 * archived rows client-side, then plots each task from created_at to due_date
 * across a fixed 8-week horizontal axis.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddTaskModal } from "@/components/tasks/add-task-modal";
import { useEmployees } from "@/components/employees/employees-context";
import { useProjects } from "@/lib/hooks/use-projects";
import type { MilestoneRow } from "@/lib/hooks/use-milestones";
import {
  type TaskRow,
  type TaskStatus,
} from "@/components/sprint/kanban-board";

const DAY_MS = 86_400_000;
const AXIS_DAYS = 56;
const BAR_HEIGHT = 24;
const ROW_GAP = 6;
const LANE_TOP_PAD = 8;
const LABEL_WIDTH_CLASS = "w-52";

type TimelineStatus = Extract<
  TaskStatus,
  "todo" | "in_progress" | "review" | "done"
>;

const TIMELINE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "todo",
  "in_progress",
  "review",
  "done",
]);

export interface TaskTimelineProps {
  projectFilter?: string | null;
  milestoneFilter?: string | null;
  dueFilter?: "overdue" | "today" | "this_week" | "none" | null;
  refreshKey?: number;
  onCountsChange?: (counts: {
    total: number;
    in_progress: number;
    review: number;
    done: number;
  }) => void;
}

type PlottedTask = {
  task: TaskRow;
  startMs: number;
  endMs: number;
  leftPct: number;
  widthPct: number;
  row: number;
};

type Lane = {
  id: string;
  title: string;
  dueDate: number | null;
  tasks: PlottedTask[];
  rowCount: number;
  unscheduled: boolean;
};

export function TaskTimeline({
  projectFilter = null,
  milestoneFilter = null,
  dueFilter = null,
  refreshKey = 0,
  onCountsChange,
}: TaskTimelineProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [milestonesById, setMilestonesById] = useState<
    Record<string, MilestoneRow>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const { employees } = useEmployees();
  const { projects } = useProjects();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const sp = new URLSearchParams();
      if (projectFilter) sp.set("project_id", projectFilter);
      if (milestoneFilter) sp.set("milestone_id", milestoneFilter);
      if (dueFilter) sp.set("due", dueFilter);
      const qs = sp.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/tasks ${res.status}`);
      const data = (await res.json()) as { tasks: TaskRow[] };
      const filtered = (data.tasks ?? []).filter((t) =>
        TIMELINE_STATUSES.has(t.status),
      );
      setTasks(filtered);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectFilter, milestoneFilter, dueFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!onCountsChange) return;
    onCountsChange({
      total: tasks.length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      review: tasks.filter((t) => t.status === "review").length,
      done: tasks.filter((t) => t.status === "done").length,
    });
  }, [tasks, onCountsChange]);

  const projectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.project_id) ids.add(task.project_id);
    }
    return Array.from(ids);
  }, [tasks]);

  useEffect(() => {
    let cancelled = false;
    async function loadMilestones() {
      if (projectIds.length === 0) {
        setMilestonesById({});
        return;
      }
      try {
        const groups = await Promise.all(
          projectIds.map(async (projectId) => {
            const res = await fetch(
              `/api/projects/${encodeURIComponent(projectId)}/milestones`,
              { cache: "no-store" },
            );
            if (!res.ok) return [] as MilestoneRow[];
            const data = (await res.json()) as { milestones: MilestoneRow[] };
            return Array.isArray(data.milestones) ? data.milestones : [];
          }),
        );
        if (cancelled) return;
        const next: Record<string, MilestoneRow> = {};
        for (const group of groups) {
          for (const milestone of group) next[milestone.id] = milestone;
        }
        setMilestonesById(next);
      } catch {
        if (!cancelled) setMilestonesById({});
      }
    }
    void loadMilestones();
    return () => {
      cancelled = true;
    };
  }, [projectIds]);

  const { axisStart, axisEnd } = useMemo(() => buildAxis(tasks), [tasks]);
  const lanes = useMemo(
    () => buildLanes(tasks, milestonesById, axisStart, axisEnd),
    [tasks, milestonesById, axisStart, axisEnd],
  );

  const plottedCount = lanes.reduce((sum, lane) => sum + lane.tasks.length, 0);
  const todayPct = pctFor(Date.now(), axisStart, axisEnd);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  if (loading && tasks.length === 0) {
    return (
      <div className="card-surface px-4 py-12 text-center text-xs text-muted">
        Loading timeline…
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
        <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className="flex border-b border-subtle bg-white">
              <div
                className={`sticky left-0 z-20 ${LABEL_WIDTH_CLASS} shrink-0 border-r border-subtle bg-white px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted`}
              >
                Milestone
              </div>
              <div className="relative h-12 flex-1 bg-white">
                <WeekGrid axisStart={axisStart} axisEnd={axisEnd} labels />
                {todayInRange ? (
                  <span
                    className="absolute top-1 z-20 -translate-x-1/2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white"
                    style={{ left: `${todayPct}%` }}
                  >
                    Today
                  </span>
                ) : null}
              </div>
            </div>

            {plottedCount === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center px-4 py-16 text-center text-xs text-muted">
                No tasks to plot — try Board view or Add Task.
              </div>
            ) : (
              <div>
                {lanes.map((lane) => (
                  <LaneRow
                    key={lane.id}
                    lane={lane}
                    axisStart={axisStart}
                    axisEnd={axisEnd}
                    todayPct={todayPct}
                    todayInRange={todayInRange}
                    onEdit={setEditTask}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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

function LaneRow({
  lane,
  axisStart,
  axisEnd,
  todayPct,
  todayInRange,
  onEdit,
}: {
  lane: Lane;
  axisStart: number;
  axisEnd: number;
  todayPct: number;
  todayInRange: boolean;
  onEdit: (task: TaskRow) => void;
}) {
  const height = Math.max(52, LANE_TOP_PAD * 2 + lane.rowCount * BAR_HEIGHT + Math.max(0, lane.rowCount - 1) * ROW_GAP);
  return (
    <div className="flex border-b border-subtle last:border-b-0">
      <div
        className={`sticky left-0 z-10 ${LABEL_WIDTH_CLASS} shrink-0 border-r border-subtle bg-white px-3 py-3`}
        style={{ minHeight: height }}
      >
        <div className="truncate text-xs font-semibold text-primary">
          {lane.title}
        </div>
        <div className="mt-1 text-[10px] text-muted">
          {lane.dueDate != null ? `Due ${formatDate(lane.dueDate)}` : "No due date"}
        </div>
      </div>
      <div
        className="relative flex-1 bg-white"
        style={{ minHeight: height }}
      >
        <WeekGrid axisStart={axisStart} axisEnd={axisEnd} />
        {todayInRange ? (
          <span
            className="absolute bottom-0 top-0 z-10 w-px bg-accent"
            style={{ left: `${todayPct}%` }}
          />
        ) : null}
        {lane.tasks.map((item) => (
          <TaskBar
            key={item.task.id}
            item={item}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function TaskBar({
  item,
  onEdit,
}: {
  item: PlottedTask;
  onEdit: (task: TaskRow) => void;
}) {
  const status = item.task.status as TimelineStatus;
  const done = status === "done";
  const title = [
    item.task.title,
    `Status: ${statusLabel(status)}`,
    item.task.due_date != null ? `Due: ${formatDate(item.task.due_date)}` : "No due date",
  ].join("\n");

  return (
    <button
      type="button"
      onClick={() => onEdit(item.task)}
      title={title}
      className={[
        "absolute z-20 flex h-6 items-center rounded-md border px-2 text-left text-[10px] font-semibold shadow-sm hover:opacity-90",
        statusClasses(status),
        done ? "opacity-80" : "",
      ].join(" ")}
      style={{
        left: `${item.leftPct}%`,
        width: `${item.widthPct}%`,
        top: LANE_TOP_PAD + item.row * (BAR_HEIGHT + ROW_GAP),
        minWidth: 18,
      }}
    >
      <span
        className={[
          "min-w-0 flex-1 truncate",
          done ? "line-through" : "",
        ].join(" ")}
      >
        {item.task.title}
      </span>
    </button>
  );
}

function WeekGrid({
  axisStart,
  axisEnd,
  labels = false,
}: {
  axisStart: number;
  axisEnd: number;
  labels?: boolean;
}) {
  const ticks = useMemo(() => {
    const out: Array<{ ms: number; pct: number }> = [];
    for (let i = 0; i <= AXIS_DAYS; i += 7) {
      const ms = axisStart + i * DAY_MS;
      out.push({ ms, pct: pctFor(ms, axisStart, axisEnd) });
    }
    return out;
  }, [axisStart, axisEnd]);

  return (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.ms}
          className="absolute bottom-0 top-0 border-l border-subtle"
          style={{ left: `${tick.pct}%` }}
        >
          {labels ? (
            <span className="absolute left-1 top-6 whitespace-nowrap text-[10px] font-medium text-muted">
              {formatDate(tick.ms)}
            </span>
          ) : null}
        </span>
      ))}
    </>
  );
}

function buildAxis(tasks: TaskRow[]): { axisStart: number; axisEnd: number } {
  const now = new Date();
  const thisMonday = startOfMondayWeek(now).getTime();
  const earliest = tasks
    .map((t) => t.created_at)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b)[0];

  const defaultStart = thisMonday;
  const unclampedStart =
    earliest != null ? startOfMondayWeek(new Date(earliest)).getTime() : defaultStart;
  const oldestAllowedStart = thisMonday - 7 * DAY_MS;
  const axisStart = Math.max(unclampedStart, oldestAllowedStart);
  return { axisStart, axisEnd: axisStart + AXIS_DAYS * DAY_MS };
}

function buildLanes(
  tasks: TaskRow[],
  milestonesById: Record<string, MilestoneRow>,
  axisStart: number,
  axisEnd: number,
): Lane[] {
  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const rawStart = validMs(task.created_at) ?? Date.now();
    const rawEnd =
      validMs(task.due_date) ?? rawStart + DAY_MS;
    const normalizedEnd =
      rawEnd <= rawStart ? rawStart + DAY_MS : rawEnd;
    if (normalizedEnd < axisStart || rawStart > axisEnd) continue;

    const key = task.milestone_id ?? "__unscheduled__";
    const arr = groups.get(key);
    if (arr) arr.push(task);
    else groups.set(key, [task]);
  }

  const lanes: Lane[] = [];
  for (const [key, laneTasks] of groups) {
    const packed = packLane(laneTasks, axisStart, axisEnd);
    if (key === "__unscheduled__") {
      lanes.push({
        id: key,
        title: "Unscheduled",
        dueDate: null,
        tasks: packed.tasks,
        rowCount: packed.rowCount,
        unscheduled: true,
      });
      continue;
    }
    const milestone = milestonesById[key];
    lanes.push({
      id: key,
      title: milestone?.name ?? "Milestone",
      dueDate: milestone?.due_date ?? null,
      tasks: packed.tasks,
      rowCount: packed.rowCount,
      unscheduled: false,
    });
  }

  return lanes.sort((a, b) => {
    if (a.unscheduled && !b.unscheduled) return 1;
    if (!a.unscheduled && b.unscheduled) return -1;
    const ad = a.dueDate ?? Number.POSITIVE_INFINITY;
    const bd = b.dueDate ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  });
}

function packLane(
  tasks: TaskRow[],
  axisStart: number,
  axisEnd: number,
): { tasks: PlottedTask[]; rowCount: number } {
  const intervals = tasks
    .map((task) => {
      const rawStart = validMs(task.created_at) ?? Date.now();
      const rawEnd = validMs(task.due_date) ?? rawStart + DAY_MS;
      const normalizedEnd = rawEnd <= rawStart ? rawStart + DAY_MS : rawEnd;
      return {
        task,
        startMs: Math.max(rawStart, axisStart),
        endMs: Math.min(normalizedEnd, axisEnd),
        sortStart: rawStart,
      };
    })
    .filter((item) => item.endMs >= axisStart && item.startMs <= axisEnd)
    .sort((a, b) => a.sortStart - b.sortStart || a.endMs - b.endMs);

  const rowEnds: number[] = [];
  const packed: PlottedTask[] = [];
  for (const item of intervals) {
    let row = rowEnds.findIndex((end) => item.startMs >= end);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(item.endMs);
    } else {
      rowEnds[row] = item.endMs;
    }
    const leftPct = pctFor(item.startMs, axisStart, axisEnd);
    const rightPct = pctFor(item.endMs, axisStart, axisEnd);
    packed.push({
      task: item.task,
      startMs: item.startMs,
      endMs: item.endMs,
      leftPct,
      widthPct: Math.max(0.8, rightPct - leftPct),
      row,
    });
  }

  return { tasks: packed, rowCount: Math.max(1, rowEnds.length) };
}

function startOfMondayWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  out.setHours(0, 0, 0, 0);
  return out;
}

function validMs(ms: number | null): number | null {
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

function pctFor(ms: number, start: number, end: number): number {
  return ((ms - start) / (end - start)) * 100;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: TimelineStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "review") return "Review";
  if (status === "done") return "Done";
  return "To Do";
}

function statusClasses(status: TimelineStatus): string {
  switch (status) {
    case "in_progress":
      return "border-accent bg-accent text-white";
    case "review":
      return "border-status-busy bg-status-busy text-white";
    case "done":
      return "border-status-online bg-status-online text-white";
    case "todo":
    default:
      return "border-strong bg-surface-muted text-secondary";
  }
}
