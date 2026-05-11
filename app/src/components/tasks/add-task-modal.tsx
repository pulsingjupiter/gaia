"use client";
/**
 * AddTaskModal — direct work-task creator (and editor) for the /tasks kanban
 * board.
 *
 * Posts to /api/tasks for creation (or PATCH /api/tasks/[id] when an existing
 * `task` is supplied). Body shape:
 *   { title, project_id?, employee_id?, status?, priority?, description?,
 *     milestone_id?, due_date?, recurrence?, recurrence_anchor? }
 *
 * UX notes:
 *   - Esc + click-outside both close. Body scroll lock while open.
 *   - Max width ~520px.
 *   - Status defaults to "todo" so new rows land on the leftmost kanban column
 *     instead of the project Backlog.
 *   - "(no project)" / "(unassigned)" are first options in their dropdowns,
 *     emitting null on submit.
 *   - When `task` is supplied the form is pre-populated and the modal swaps
 *     into edit mode (PATCH instead of POST, title/CTA copy adjusted).
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Employee } from "@/lib/types";
import type { ProjectRow } from "@/lib/hooks/use-projects";
import { useMilestones } from "@/lib/hooks/use-milestones";
import type { TaskRow } from "@/components/sprint/kanban-board";

const STATUSES = ["todo", "in_progress", "review", "done"] as const;
type Status = (typeof STATUSES)[number];

const PRIORITIES = ["low", "medium", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

const RECURRENCES = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
type Recurrence = (typeof RECURRENCES)[number];

const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Never",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

export type AddTaskModalProps = {
  open: boolean;
  projects: ProjectRow[];
  employees: Employee[];
  /** Optional pre-selected project (e.g. when the board is project-filtered). */
  defaultProjectId?: string | null;
  /** Optional pre-filled due date (used by Calendar empty-cell click). */
  defaultDueDate?: string | null;
  /**
   * When set, the modal opens in edit mode for this row — PATCH instead of
   * POST, populated fields, title + CTA copy updated. The form still uses
   * the same component so behaviour stays in lockstep.
   */
  task?: TaskRow | null;
  onClose: () => void;
  /** Fired after a successful POST or PATCH so the board can refetch. */
  onCreated?: () => void;
};

function msToInputDate(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AddTaskModal({
  open,
  projects,
  employees,
  defaultProjectId = null,
  defaultDueDate = null,
  task = null,
  onClose,
  onCreated,
}: AddTaskModalProps) {
  const editing = Boolean(task);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [description, setDescription] = useState("");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { milestones } = useMilestones(projectId || null);

  // Reset state every time the modal opens. In edit mode, seed from the task;
  // otherwise pre-select project (when board is project-filtered) and any
  // calendar-supplied default due date.
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setProjectId(task.project_id ?? "");
      setEmployeeId(task.employee_id ?? "");
      // Only the kanban subset of statuses is editable here. Backlog/archived
      // tasks fall back to 'todo' so the dropdown stays valid.
      const kanbanStatus: Status = (
        STATUSES as readonly string[]
      ).includes(task.status)
        ? (task.status as Status)
        : "todo";
      setStatus(kanbanStatus);
      setPriority(task.priority);
      setRecurrence((task.recurrence ?? "none") as Recurrence);
      setDescription(task.description ?? "");
      setMilestoneId(task.milestone_id ?? "");
      setDueDate(msToInputDate(task.due_date));
    } else {
      setTitle("");
      setProjectId(defaultProjectId ?? "");
      setEmployeeId("");
      setStatus("todo");
      setPriority("medium");
      setRecurrence("none");
      setDescription("");
      setMilestoneId("");
      setDueDate(defaultDueDate ?? "");
    }
    setSubmitting(false);
    setError(null);
  }, [open, defaultProjectId, defaultDueDate, task]);

  // Clear milestone selection if the project changes (milestones are
  // project-scoped, so the previous id wouldn't apply).
  useEffect(() => {
    setMilestoneId("");
  }, [projectId]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const visibleEmployees = employees.filter(
    (e) => !e.internalOnly && e.id !== "system" && e.slug !== "system",
  );
  const activeProjects = projects.filter((p) => p.archived === 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const dueDateMs =
        dueDate.trim() !== "" ? new Date(dueDate).getTime() : null;

      if (editing && task) {
        // Edit mode: PATCH the row. We always send every field so the server
        // sees the canonical state — fields not edited still resolve to their
        // current value via the form state we seeded from the task.
        const patchBody: Record<string, unknown> = {
          title: title.trim(),
          status,
          priority,
          project_id: projectId || null,
          employee_id: employeeId || null,
          description: description.trim() || null,
          milestone_id: milestoneId || null,
          due_date: dueDateMs,
          recurrence: recurrence === "none" ? null : recurrence,
          // Preserve the original anchor when set; otherwise (e.g. user just
          // turned recurrence on) fall back to the current due_date.
          recurrence_anchor:
            recurrence === "none"
              ? null
              : task.recurrence_anchor ?? dueDateMs,
        };
        const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            data?.error ?? `PATCH /api/tasks/${task.id} ${res.status}`,
          );
        }
      } else {
        const body: Record<string, unknown> = {
          title: title.trim(),
          status,
          priority,
        };
        if (projectId) body.project_id = projectId;
        if (employeeId) body.employee_id = employeeId;
        if (description.trim()) body.description = description.trim();
        if (milestoneId) body.milestone_id = milestoneId;
        if (dueDate) body.due_date = dueDate;
        if (recurrence !== "none") {
          body.recurrence = recurrence;
          // Anchor mirrors the chosen due_date — server falls back to null if
          // due_date wasn't supplied.
          if (dueDateMs !== null) body.recurrence_anchor = dueDateMs;
        }

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
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-[520px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">
              {editing ? "Edit Task" : "New Task"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {editing
                ? "Update fields and save changes."
                : "Add a work item to the kanban board."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-muted"
          >
            <X size={16} />
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <Field label="Title" required>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wire up new pricing page"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                <option value="">(no project)</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Owner">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                <option value="">(unassigned)</option>
                {visibleEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Repeats">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </select>
              {recurrence !== "none" ? (
                <p className="mt-1 text-[10px] text-muted">
                  A new instance will be created automatically when you mark
                  this done.
                </p>
              ) : null}
            </Field>

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Milestone">
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={!projectId}
                title={!projectId ? "Pick a project first" : undefined}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent disabled:bg-surface-muted disabled:text-muted"
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
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context — what 'done' looks like, links, etc."
              rows={3}
              className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          {error ? (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 px-2.5 py-1.5 text-xs text-status-error">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting
                ? editing
                  ? "Saving…"
                  : "Adding…"
                : editing
                  ? "Save changes"
                  : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-secondary">
        {label}
        {required ? <span className="text-status-error">*</span> : null}
      </span>
      {children}
    </label>
  );
}
