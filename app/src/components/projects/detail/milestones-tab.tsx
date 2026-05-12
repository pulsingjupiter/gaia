"use client";
/**
 * MilestonesTab — project-scoped milestone CRUD with task-progress rollup.
 *
 * Top-of-tab toolbar (+ Add Milestone, status filter) plus a card list. Each
 * card shows the milestone's name, optional due date (color-coded by
 * urgency), description, a progress bar built from the milestone's tasks
 * (`milestone_id === this.id` on /api/tasks scoped to the project), and a
 * row of actions (View tasks, Edit, Delete). Delete is a two-step inline
 * confirm — the trash icon flips to a red check that must be clicked to
 * commit. The mutation does not cascade-delete tasks; tasks pointing at the
 * milestone are nulled out instead (handled server-side).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  useMilestones,
  type AddMilestoneInput,
  type MilestoneRow,
  type MilestoneStatus,
  type UpdateMilestoneInput,
} from "@/lib/hooks/use-milestones";

type Props = {
  projectId: string;
  /** When provided, the empty-state surfaces a "Plan with Gaia" CTA. */
  onPlanWithClaude?: () => void;
};

type TaskCount = {
  total: number;
  done: number;
  in_progress: number;
};

type EditingState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; milestone: MilestoneRow };

type ColorTone = {
  dot: string;
  bg: string;
  fg: string;
  label: string;
};

function urgencyTone(m: MilestoneRow): ColorTone {
  if (m.status === "complete" || m.status === "archived") {
    return { dot: "#94A3B8", bg: "#F1F5F9", fg: "#475569", label: "Closed" };
  }
  if (m.due_date == null) {
    return { dot: "#10B981", bg: "#D1FAE5", fg: "#047857", label: "No due date" };
  }
  const diff = m.due_date - Date.now();
  if (diff < 0) return { dot: "#EF4444", bg: "#FEE2E2", fg: "#B91C1C", label: "Overdue" };
  if (diff <= 7 * 86_400_000) {
    return { dot: "#F59E0B", bg: "#FEF3C7", fg: "#B45309", label: "Due soon" };
  }
  return { dot: "#10B981", bg: "#D1FAE5", fg: "#047857", label: "On track" };
}

function formatDue(ms: number | null): string {
  if (ms == null) return "No due date";
  const d = new Date(ms);
  const diff = ms - Date.now();
  const dayMs = 86_400_000;
  if (diff < -dayMs) {
    return `Overdue ${Math.abs(Math.floor(diff / dayMs))}d (${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
  }
  if (diff < 0) return `Overdue today (${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
  if (diff < dayMs) return `Due today`;
  if (diff < 2 * dayMs) return `Due tomorrow`;
  if (diff < 7 * dayMs) {
    return `Due ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  }
  return `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}`;
}

function toDateInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function MilestonesTab({ projectId, onPlanWithClaude }: Props) {
  const { milestones, loading, error, add, update, remove } =
    useMilestones(projectId);
  const [editing, setEditing] = useState<EditingState>({ mode: "closed" });
  const [statusFilter, setStatusFilter] = useState<"all" | MilestoneStatus>(
    "all",
  );
  const [counts, setCounts] = useState<Record<string, TaskCount>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Pull per-milestone task counts off the /api/tasks endpoint (one call
  // returns every task for the project; we group client-side). Cheap enough
  // for current scales — revisit if a project ever grows past ~1k tasks.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/tasks?project_id=${encodeURIComponent(projectId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          tasks: Array<{
            milestone_id: string | null;
            status: string;
          }>;
        };
        if (cancelled) return;
        const map: Record<string, TaskCount> = {};
        for (const t of data.tasks ?? []) {
          if (!t.milestone_id) continue;
          const cur = map[t.milestone_id] ?? {
            total: 0,
            done: 0,
            in_progress: 0,
          };
          cur.total += 1;
          if (t.status === "done") cur.done += 1;
          if (t.status === "in_progress") cur.in_progress += 1;
          map[t.milestone_id] = cur;
        }
        setCounts(map);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, milestones]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return milestones;
    return milestones.filter((m) => m.status === statusFilter);
  }, [milestones, statusFilter]);

  async function handleSubmit(input: AddMilestoneInput | UpdateMilestoneInput) {
    if (editing.mode === "create") {
      await add(input as AddMilestoneInput);
    } else if (editing.mode === "edit") {
      await update(editing.milestone.id, input as UpdateMilestoneInput);
    }
    setEditing({ mode: "closed" });
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    await remove(id);
    setBusyId(null);
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "all" | MilestoneStatus)}
          options={[
            { value: "all", label: "All milestones" },
            { value: "active", label: "Active" },
            { value: "complete", label: "Complete" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus size={12} /> Add Milestone
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-error bg-red-50 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      {loading && milestones.length === 0 ? (
        <div className="card-surface px-4 py-12 text-center text-xs text-muted">
          Loading milestones…
        </div>
      ) : filtered.length === 0 ? (
        milestones.length === 0 ? (
          <div className="card-surface flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-secondary">No milestones yet.</p>
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
                <Plus size={12} /> Add Milestone
              </button>
            </div>
          </div>
        ) : (
          <div className="card-surface px-4 py-12 text-center text-xs text-muted">
            No milestones match this filter.
          </div>
        )
      ) : (
        <div className="card-surface divide-y divide-subtle overflow-hidden">
          {filtered.map((m) => {
            const tone = urgencyTone(m);
            const tc = counts[m.id] ?? { total: 0, done: 0, in_progress: 0 };
            const progress = tc.total > 0 ? tc.done / tc.total : 0;
            const isDeleting = deletingId === m.id;
            return (
              <div key={m.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: tone.dot }}
                      />
                      <h4 className="text-sm font-semibold text-primary">
                        {m.name}
                      </h4>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {m.due_date != null ? <Calendar size={10} /> : null}
                        {formatDue(m.due_date)}
                      </span>
                      {m.status !== "active" ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
                          {m.status}
                        </span>
                      ) : null}
                    </div>
                    {m.description ? (
                      <p className="mt-1 text-xs text-secondary">
                        {m.description}
                      </p>
                    ) : null}
                    <div className="mt-2.5">
                      {tc.total > 0 ? (
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(2, Math.round(progress * 100))}%`,
                                background: tone.dot,
                              }}
                            />
                          </div>
                          <span>
                            <span className="font-semibold text-secondary">
                              {tc.done}
                            </span>
                            /{tc.total} task{tc.total === 1 ? "" : "s"}
                          </span>
                          {tc.in_progress > 0 ? (
                            <>
                              <span>·</span>
                              <span>{tc.in_progress} in progress</span>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted">
                          No tasks assigned yet
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/tasks?project=${encodeURIComponent(projectId)}&milestone=${encodeURIComponent(m.id)}`}
                      className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
                    >
                      View tasks
                    </Link>
                    <button
                      type="button"
                      aria-label="Edit milestone"
                      onClick={() => setEditing({ mode: "edit", milestone: m })}
                      className="rounded-md border border-strong bg-white p-1.5 text-secondary hover:bg-surface-muted"
                    >
                      <Pencil size={11} />
                    </button>
                    {isDeleting ? (
                      <button
                        type="button"
                        aria-label="Confirm delete"
                        disabled={busyId === m.id}
                        onClick={() => handleDelete(m.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-status-error bg-status-error px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <CheckCircle2 size={11} />
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Delete milestone"
                        onClick={() => setDeletingId(m.id)}
                        className="rounded-md border border-strong bg-white p-1.5 text-status-error hover:bg-red-50"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing.mode !== "closed" ? (
        <MilestoneModal
          initial={editing.mode === "edit" ? editing.milestone : null}
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

function MilestoneModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: MilestoneRow | null;
  onCancel: () => void;
  onSubmit: (
    input: AddMilestoneInput | UpdateMilestoneInput,
  ) => Promise<void> | void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(toDateInput(initial?.due_date ?? null));
  const [status, setStatus] = useState<MilestoneStatus>(
    initial?.status ?? "active",
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const payload: AddMilestoneInput & UpdateMilestoneInput = {
      name: name.trim(),
      description: description.trim() || null,
      due_date: dueDate ? dueDate : null,
      status,
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
            {initial ? "Edit milestone" : "Add milestone"}
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
          <Field label="Name">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
            />
          </Field>
          <Field label="Due date (optional)">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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
          {initial ? (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          ) : null}
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
            disabled={submitting || !name.trim()}
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
