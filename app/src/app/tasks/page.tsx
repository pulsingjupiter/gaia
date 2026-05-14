"use client";
/**
 * /tasks — kanban board over the live `tasks` table.
 *
 * Tasks with status `backlog` or `archived` are excluded; everything else
 * (todo / in_progress / review / done) is grouped into four columns.
 * Drag-drop fires PATCH /api/backlog/[id] with the new status.
 *
 * The board owns the fetch and reports counts up via `onCountsChange` so the
 * KPI strip stays in sync without a second request. The "This week" badge is
 * informational only; Board, Timeline, and Calendar each own their fetches
 * and report counts up as needed.
 *
 * Project filter: a "Project: …" dropdown in the tabs row scopes the board
 * to a single project. State is persisted to `?project=<id>` so links and
 * reloads keep the filter. "All projects" clears the param.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SprintKpiStrip } from "@/components/sprint/kpi-strip";
import { KanbanBoard, type KanbanCounts } from "@/components/sprint/kanban-board";
import { AddTaskModal } from "@/components/tasks/add-task-modal";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { useProjects, type ProjectRow } from "@/lib/hooks/use-projects";
import { useMilestones } from "@/lib/hooks/use-milestones";
import { useEmployees } from "@/components/employees/employees-context";

type DueParam = "overdue" | "today" | "this_week" | "none";
const VALID_DUE: readonly DueParam[] = ["overdue", "today", "this_week", "none"];

const DUE_LABEL: Record<DueParam | "any", string> = {
  any: "Anytime",
  overdue: "Overdue",
  today: "Due today",
  this_week: "Due this week",
  none: "No due date",
};

type TabView = "board" | "calendar" | "timeline";

const TABS: { label: string; tooltip?: string; view?: TabView }[] = [
  { label: "Board", view: "board" },
  { label: "Timeline", view: "timeline" },
  { label: "Calendar", view: "calendar" },
];

const DEFAULT_PROJECT_COLOR = "#5B5BD6";

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams?.get("project") ?? null;
  const milestoneParam = searchParams?.get("milestone") ?? null;
  const dueParamRaw = searchParams?.get("due") ?? null;
  const dueParam: DueParam | null =
    dueParamRaw && (VALID_DUE as readonly string[]).includes(dueParamRaw)
      ? (dueParamRaw as DueParam)
      : null;

  const { projects } = useProjects();
  const { employees } = useEmployees();
  const activeProjects = useMemo(
    () => projects.filter((p) => p.archived === 0),
    [projects],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TabView>("board");
  const [calendarDefaultDate, setCalendarDefaultDate] = useState<string | null>(
    null,
  );

  // If the URL points at a project that no longer exists (archived or
  // deleted) we silently fall back to "All projects" without rewriting the
  // URL — the dropdown still reflects reality and selecting a real project
  // overwrites the stale param.
  const selectedProject: ProjectRow | null = useMemo(() => {
    if (!projectParam) return null;
    return activeProjects.find((p) => p.id === projectParam) ?? null;
  }, [projectParam, activeProjects]);

  // Only fetch milestones when a project is selected — without a project,
  // the milestone dropdown is disabled / hidden.
  const { milestones } = useMilestones(selectedProject?.id ?? null);
  const milestoneNamesById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ms of milestones) m[ms.id] = ms.name;
    return m;
  }, [milestones]);

  const [counts, setCounts] = useState<KanbanCounts>({
    planned: 0,
    inProgress: 0,
    review: 0,
    completed: 0,
  });

  const setProjectFilter = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (id) params.set("project", id);
      else params.delete("project");
      // Drop milestone filter when changing project — it's project-scoped.
      params.delete("milestone");
      const qs = params.toString();
      router.replace(qs ? `/tasks?${qs}` : "/tasks");
    },
    [router, searchParams],
  );

  const setMilestoneFilter = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (id) params.set("milestone", id);
      else params.delete("milestone");
      const qs = params.toString();
      router.replace(qs ? `/tasks?${qs}` : "/tasks");
    },
    [router, searchParams],
  );

  const setDueFilter = useCallback(
    (v: DueParam | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (v) params.set("due", v);
      else params.delete("due");
      const qs = params.toString();
      router.replace(qs ? `/tasks?${qs}` : "/tasks");
    },
    [router, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.replace("/tasks");
  }, [router]);

  const filtersActive = Boolean(milestoneParam || dueParam);

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Tasks"
        subtitle="Active tasks across your projects — drag to update status."
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary">
              This week
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus size={14} />
              Add Task
            </button>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-muted"
            >
              Open Tasks
            </Link>
          </div>
        }
      />

      <SprintKpiStrip
        planned={counts.planned}
        inProgress={counts.inProgress}
        review={counts.review}
        completed={counts.completed}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-subtle">
        <div className="flex gap-6">
          {TABS.map((t) => {
            const isActive = t.view === activeTab;
            const isDisabled = !t.view;
            return (
              <button
                key={t.label}
                type="button"
                disabled={isDisabled}
                title={t.tooltip}
                onClick={() => {
                  if (t.view) setActiveTab(t.view);
                }}
                className={
                  isActive
                    ? "border-b-2 border-accent pb-2 text-sm font-semibold text-accent"
                    : isDisabled
                      ? "cursor-not-allowed pb-2 text-sm text-muted opacity-60"
                      : "pb-2 text-sm text-secondary hover:text-primary"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <MilestoneFilterMenu
            disabled={!selectedProject}
            milestones={milestones}
            selectedId={milestoneParam}
            onSelect={setMilestoneFilter}
          />
          <DueFilterMenu selected={dueParam} onSelect={setDueFilter} />
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-full border border-strong bg-white px-2.5 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
            >
              <X size={11} />
              Clear filters
            </button>
          ) : null}
          <ProjectFilterMenu
            projects={activeProjects}
            selected={selectedProject}
            onSelect={setProjectFilter}
          />
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "board" ? (
          <KanbanBoard
            projectId={selectedProject?.id ?? null}
            projectName={selectedProject?.name ?? null}
            milestoneId={milestoneParam}
            due={dueParam}
            milestoneNamesById={milestoneNamesById}
            onCountsChange={setCounts}
            refreshKey={refreshKey}
          />
        ) : activeTab === "timeline" ? (
          <TaskTimeline
            projectFilter={selectedProject?.id ?? null}
            milestoneFilter={milestoneParam}
            dueFilter={dueParam}
            refreshKey={refreshKey}
            onCountsChange={setCounts}
          />
        ) : (
          <TaskCalendar
            projectId={selectedProject?.id ?? null}
            milestoneId={milestoneParam}
            milestoneNamesById={milestoneNamesById}
            refreshKey={refreshKey}
            onCreateForDate={(isoDate) => {
              setCalendarDefaultDate(isoDate);
              setModalOpen(true);
            }}
            onRefreshNeeded={() => setRefreshKey((n) => n + 1)}
          />
        )}
      </div>

      <AddTaskModal
        open={modalOpen}
        projects={projects}
        employees={employees}
        defaultProjectId={selectedProject?.id ?? null}
        defaultDueDate={calendarDefaultDate}
        onClose={() => {
          setModalOpen(false);
          setCalendarDefaultDate(null);
        }}
        onCreated={() => setRefreshKey((n) => n + 1)}
      />
    </div>
  );
}

function ProjectFilterMenu({
  projects,
  selected,
  onSelect,
}: {
  projects: ProjectRow[];
  selected: ProjectRow | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  // Close on outside click — small enough to inline here.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest("[data-project-filter]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label = selected ? selected.name : "All projects";
  const dotColor = selected?.color ?? null;

  return (
    <div data-project-filter className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
      >
        <span className="text-muted">Project:</span>
        {dotColor ? (
          <span
            className="size-2 rounded-full"
            style={{ background: dotColor }}
          />
        ) : null}
        <span className="max-w-[160px] truncate text-primary">{label}</span>
        <ChevronDown size={12} className="text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-strong bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className={
              "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-muted" +
              (selected === null ? " bg-surface-muted font-semibold" : "")
            }
          >
            <span className="size-2 rounded-full bg-slate-300" />
            <span className="flex-1 truncate text-primary">All projects</span>
          </button>
          {projects.length === 0 ? (
            <div className="border-t border-subtle px-3 py-2 text-[11px] text-muted">
              No projects yet
            </div>
          ) : (
            <div className="border-t border-subtle">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-muted" +
                    (selected?.id === p.id
                      ? " bg-surface-muted font-semibold"
                      : "")
                  }
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: p.color ?? DEFAULT_PROJECT_COLOR }}
                  />
                  <span className="flex-1 truncate text-primary">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MilestoneFilterMenu({
  disabled,
  milestones,
  selectedId,
  onSelect,
}: {
  disabled: boolean;
  milestones: Array<{ id: string; name: string; due_date: number | null }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest("[data-milestone-filter]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = selectedId
    ? milestones.find((m) => m.id === selectedId) ?? null
    : null;
  const label = selected ? selected.name : "All";

  return (
    <div data-milestone-filter className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? "Select a project to filter by milestone" : undefined}
        className="inline-flex items-center gap-2 rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-muted">Milestone:</span>
        <span className="max-w-[140px] truncate text-primary">{label}</span>
        <ChevronDown size={12} className="text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-strong bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className={
              "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-muted" +
              (selectedId === null ? " bg-surface-muted font-semibold" : "")
            }
          >
            <span className="flex-1 truncate text-primary">All milestones</span>
          </button>
          {milestones.length === 0 ? (
            <div className="border-t border-subtle px-3 py-2 text-[11px] text-muted">
              No milestones yet
            </div>
          ) : (
            <div className="border-t border-subtle">
              {milestones.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelect(m.id);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-muted" +
                    (selectedId === m.id
                      ? " bg-surface-muted font-semibold"
                      : "")
                  }
                >
                  <span className="flex-1 truncate text-primary">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DueFilterMenu({
  selected,
  onSelect,
}: {
  selected: DueParam | null;
  onSelect: (v: DueParam | null) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest("[data-due-filter]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const label = selected ? DUE_LABEL[selected] : DUE_LABEL.any;
  return (
    <div data-due-filter className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
      >
        <span className="text-muted">Due:</span>
        <span className="max-w-[140px] truncate text-primary">{label}</span>
        <ChevronDown size={12} className="text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-strong bg-white shadow-lg">
          {(
            [
              { v: null, label: DUE_LABEL.any },
              { v: "overdue" as const, label: DUE_LABEL.overdue },
              { v: "today" as const, label: DUE_LABEL.today },
              { v: "this_week" as const, label: DUE_LABEL.this_week },
              { v: "none" as const, label: DUE_LABEL.none },
            ] satisfies Array<{ v: DueParam | null; label: string }>
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onSelect(opt.v);
                setOpen(false);
              }}
              className={
                "flex w-full items-center px-3 py-2 text-left text-xs hover:bg-surface-muted" +
                (selected === opt.v ? " bg-surface-muted font-semibold" : "")
              }
            >
              <span className="flex-1 truncate text-primary">{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
