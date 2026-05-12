"use client";
/**
 * BacklogTab — full project-scoped task CRUD with promote-to-Sprint.
 *
 * Layout: top toolbar (+ Add Task, priority filter, employee filter, sort)
 * + a row-style task list. NOT a kanban — kanban is the global Sprint page.
 */
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Pencil,
  Sparkles,
  Trash2,
  X,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useEmployees } from "@/components/employees/employees-context";
import {
  useProjectBacklog,
  type AddTaskInput,
  type TaskPriority,
  type TaskRow,
  type UpdateTaskInput,
} from "@/lib/hooks/use-project-backlog";
import { useMilestones, type MilestoneRow } from "@/lib/hooks/use-milestones";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "./format";

type Props = {
  projectId: string;
  /** When provided, the empty-state surfaces a "Plan with Gaia" CTA. */
  onPlanWithClaude?: () => void;
};

type SortKey = "newest" | "priority";
type EditingState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; task: TaskRow };

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  high: "bg-red-50 text-red-600",
  medium: "bg-amber-50 text-amber-600",
  low: "bg-slate-100 text-slate-600",
};

export function BacklogTab({ projectId, onPlanWithClaude }: Props) {
  const { tasks, loading, error, add, update, remove, promote } =
    useProjectBacklog(projectId);
  const { employees } = useEmployees();
  const { milestones } = useMilestones(projectId);

  const [editing, setEditing] = useState<EditingState>({ mode: "closed" });
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>(
    "all",
  );
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [busyId, setBusyId] = useState<string | null>(null);

  const employeeById = useMemo(() => {
    const map = new Map<string, (typeof employees)[number]>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);
  const milestoneById = useMemo(() => {
    const map = new Map<string, MilestoneRow>();
    for (const m of milestones) map.set(m.id, m);
    return map;
  }, [milestones]);

  const filtered = useMemo(() => {
    let arr = [...tasks];
    if (priorityFilter !== "all") {
      arr = arr.filter((t) => t.priority === priorityFilter);
    }
    if (employeeFilter !== "all") {
      if (employeeFilter === "__none__") {
        arr = arr.filter((t) => !t.employee_id);
      } else {
        arr = arr.filter((t) => t.employee_id === employeeFilter);
      }
    }
    if (milestoneFilter !== "all") {
      if (milestoneFilter === "__none__") {
        arr = arr.filter((t) => !t.milestone_id);
      } else {
        arr = arr.filter((t) => t.milestone_id === milestoneFilter);
      }
    }
    if (sort === "priority") {
      arr.sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (b.created_at ?? 0) - (a.created_at ?? 0),
      );
    } else {
      arr.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    }
    return arr;
  }, [tasks, priorityFilter, employeeFilter, milestoneFilter, sort]);

  async function handleSubmit(input: AddTaskInput | UpdateTaskInput) {
    if (editing.mode === "create") {
      await add(input as AddTaskInput);
    } else if (editing.mode === "edit") {
      await update(editing.task.id, input as UpdateTaskInput);
    }
    setEditing({ mode: "closed" });
  }

  async function handleDelete(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this task?"))
      return;
    setBusyId(id);
    await remove(id);
    setBusyId(null);
  }

  async function handlePromote(id: string) {
    setBusyId(id);
    await promote(id);
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as "all" | TaskPriority)}
            options={[
              { value: "all", label: "All priorities" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
          <Select
            value={employeeFilter}
            onChange={setEmployeeFilter}
            options={[
              { value: "all", label: "All agents" },
              { value: "__none__", label: "Unassigned" },
              ...employees.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
          <Select
            value={milestoneFilter}
            onChange={setMilestoneFilter}
            options={[
              { value: "all", label: "All milestones" },
              { value: "__none__", label: "No milestone" },
              ...milestones.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <Select
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              { value: "newest", label: "Newest" },
              { value: "priority", label: "Priority" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus size={12} /> Add Task
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-error bg-red-50 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      {loading && tasks.length === 0 ? (
        <div className="card-surface px-4 py-12 text-center text-xs text-muted">
          Loading backlog…
        </div>
      ) : filtered.length === 0 ? (
        tasks.length === 0 ? (
          <div className="card-surface flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-secondary">Backlog is empty.</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onPlanWithClaude ? (
                <button
                  type="button"
                  onClick={onPlanWithClaude}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Sparkles size={12} />
                  Plan with Gaia
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing({ mode: "create" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                <Plus size={12} /> Add Backlog Item
              </button>
            </div>
          </div>
        ) : (
          <div className="card-surface px-4 py-12 text-center text-xs text-muted">
            No tasks match your filter.
          </div>
        )
      ) : (
        <div className="card-surface divide-y divide-subtle overflow-hidden">
          {filtered.map((t) => {
            const owner = t.employee_id ? employeeById.get(t.employee_id) : null;
            const milestone = t.milestone_id ? milestoneById.get(t.milestone_id) : null;
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-primary">
                      {t.title}
                    </h4>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        PRIORITY_TONE[t.priority],
                      )}
                    >
                      {t.priority}
                    </span>
                    {t.playbook ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                        {t.playbook}
                      </span>
                    ) : null}
                  </div>
                  {t.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary">
                      {t.description}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    {owner ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar
                          initials={owner.initials}
                          color={owner.accent}
                          size={16}
                        />
                        {owner.name}
                      </span>
                    ) : (
                      <span>Unassigned</span>
                    )}
                    <span>•</span>
                    <span>Created {relativeTime(t.created_at)}</span>
                    <span>•</span>
                    <MilestonePicker
                      task={t}
                      milestones={milestones}
                      currentLabel={milestone ? milestone.name : "—"}
                      onChange={async (mid) => {
                        await update(t.id, { milestone_id: mid });
                      }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Promote to Tasks"
                    disabled={busyId === t.id}
                    onClick={() => handlePromote(t.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
                  >
                    <ArrowUpRight size={11} />
                    Promote
                  </button>
                  <button
                    type="button"
                    aria-label="Edit"
                    onClick={() => setEditing({ mode: "edit", task: t })}
                    className="rounded-md border border-strong bg-white p-1.5 text-secondary hover:bg-surface-muted"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    disabled={busyId === t.id}
                    onClick={() => handleDelete(t.id)}
                    className="rounded-md border border-strong bg-white p-1.5 text-status-error hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing.mode !== "closed" ? (
        <TaskModal
          initial={editing.mode === "edit" ? editing.task : null}
          employees={employees}
          milestones={milestones}
          onCancel={() => setEditing({ mode: "closed" })}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-strong bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-secondary hover:bg-surface-muted focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 text-muted"
      />
    </label>
  );
}

function toDateInput(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function TaskModal({
  initial,
  employees,
  milestones,
  onCancel,
  onSubmit,
}: {
  initial: TaskRow | null;
  employees: ReturnType<typeof useEmployees>["employees"];
  milestones: MilestoneRow[];
  onCancel: () => void;
  onSubmit: (input: AddTaskInput | UpdateTaskInput) => Promise<void> | void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [employeeId, setEmployeeId] = useState<string>(
    initial?.employee_id ?? "",
  );
  const [priority, setPriority] = useState<TaskPriority>(
    initial?.priority ?? "medium",
  );
  const [playbook, setPlaybook] = useState(initial?.playbook ?? "");
  const [milestoneId, setMilestoneId] = useState<string>(
    initial?.milestone_id ?? "",
  );
  const [dueDate, setDueDate] = useState<string>(
    toDateInput(initial?.due_date ?? null),
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const payload: AddTaskInput & UpdateTaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      employee_id: employeeId || null,
      priority,
      playbook: playbook.trim() || null,
      milestone_id: milestoneId || null,
      due_date: dueDate || null,
    };
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      onClick={onCancel}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="w-full max-w-md rounded-xl border border-strong bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-sm font-semibold text-primary">
            {initial ? "Edit task" : "Add task"}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="rounded-md p-1 text-muted hover:bg-surface-muted"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Title">
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Agent">
              <select
                value={employeeId ?? ""}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Milestone">
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
              >
                <option value="">(no milestone)</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
              />
            </Field>
          </div>
          <Field label="Playbook (optional)">
            <input
              type="text"
              value={playbook ?? ""}
              onChange={(e) => setPlaybook(e.target.value)}
              placeholder="e.g. content-research"
              className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : initial ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function MilestonePicker({
  task,
  milestones,
  currentLabel,
  onChange,
}: {
  task: TaskRow;
  milestones: MilestoneRow[];
  currentLabel: string;
  onChange: (milestoneId: string | null) => Promise<void> | void;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={task.milestone_id ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          void onChange(v === "" ? null : v);
        }}
        className="appearance-none rounded-md border border-subtle bg-white py-0.5 pl-2 pr-5 text-[11px] font-medium text-secondary hover:bg-surface-muted focus:outline-none"
        title="Milestone"
      >
        <option value="">— no milestone</option>
        {milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="pointer-events-none absolute right-1 text-muted"
      />
      <span className="sr-only">{currentLabel}</span>
    </span>
  );
}
