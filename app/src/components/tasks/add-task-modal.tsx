"use client";
/**
 * AddTaskModal — direct work-task creator for the /tasks kanban board.
 *
 * Posts to /api/tasks (the work-task surface — cron rows go through
 * /api/scheduled-runs after the cron-split). Body shape:
 *   { title, project_id?, employee_id?, status?, priority?, description? }
 *
 * UX notes:
 *   - Esc + click-outside both close. Body scroll lock while open.
 *   - Max width ~520px.
 *   - Status defaults to "todo" so new rows land on the leftmost kanban column
 *     instead of the project Backlog.
 *   - "(no project)" / "(unassigned)" are first options in their dropdowns,
 *     emitting null on submit.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Employee } from "@/lib/types";
import type { ProjectRow } from "@/lib/hooks/use-projects";
import { useMilestones } from "@/lib/hooks/use-milestones";

const STATUSES = ["todo", "in_progress", "review", "done"] as const;
type Status = (typeof STATUSES)[number];

const PRIORITIES = ["low", "medium", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

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

export type AddTaskModalProps = {
  open: boolean;
  projects: ProjectRow[];
  employees: Employee[];
  /** Optional pre-selected project (e.g. when the board is project-filtered). */
  defaultProjectId?: string | null;
  onClose: () => void;
  /** Fired after a successful POST so the board can refetch. */
  onCreated?: () => void;
};

export function AddTaskModal({
  open,
  projects,
  employees,
  defaultProjectId = null,
  onClose,
  onCreated,
}: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [description, setDescription] = useState("");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { milestones } = useMilestones(projectId || null);

  // Reset state every time the modal opens — seeds projectId from the prop
  // so a project-filtered board pre-selects that project for the new task.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setProjectId(defaultProjectId ?? "");
    setEmployeeId("");
    setStatus("todo");
    setPriority("medium");
    setDescription("");
    setMilestoneId("");
    setDueDate("");
    setSubmitting(false);
    setError(null);
  }, [open, defaultProjectId]);

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
              New Task
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Add a work item to the kanban board.
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
              {submitting ? "Adding…" : "Add task"}
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
