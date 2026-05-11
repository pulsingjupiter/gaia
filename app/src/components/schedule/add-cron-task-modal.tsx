"use client";
/**
 * AddCronTaskModal — captures a new scheduled task and POSTs it to /api/tasks.
 *
 * Schedule UX is preset-first: a chip cluster of common cadences plus a
 * "Custom" escape hatch with a raw cron field. The "preview" line under the
 * custom field reuses the same describer as the row component so what the
 * user types matches what they'll see in the table.
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { describeCron } from "@/components/schedule/cron-task-row";
import { cn } from "@/lib/cn";
import type { Employee } from "@/lib/types";
import type { ProjectRow } from "@/lib/hooks/use-projects";
import type {
  CreateCronTaskInput,
  TaskRow,
  UpdateCronTaskInput,
} from "@/lib/hooks/use-cron-tasks";

export type AddCronTaskModalProps = {
  open: boolean;
  employees: Employee[];
  projects: ProjectRow[];
  /** When set, the modal switches into edit mode and pre-populates fields. */
  editingTask?: TaskRow | null;
  onClose: () => void;
  /** Resolves with the created task row, or `null` on error. */
  onCreate: (input: CreateCronTaskInput) => Promise<TaskRow | null>;
  /** Resolves with the updated task row, or `null` on error. Required for edit mode. */
  onUpdate?: (id: string, patch: UpdateCronTaskInput) => Promise<TaskRow | null>;
};

type Preset = {
  id: string;
  label: string;
  cron: string;
};

const PRESETS: Preset[] = [
  { id: "every5", label: "Every 5 min", cron: "*/5 * * * *" },
  { id: "every15", label: "Every 15 min", cron: "*/15 * * * *" },
  { id: "every30", label: "Every 30 min", cron: "*/30 * * * *" },
  { id: "hourly", label: "Hourly", cron: "0 * * * *" },
  { id: "daily9", label: "Daily 9 AM", cron: "0 9 * * *" },
  { id: "weekdays9", label: "Weekdays 9 AM", cron: "0 9 * * 1-5" },
  { id: "weeklyMon9", label: "Weekly Mon 9 AM", cron: "0 9 * * 1" },
];
const CUSTOM_ID = "custom";

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Permissive — match digits, *, ranges, lists, steps.
  const SEG = /^[*0-9,\-/]+$/;
  return parts.every((p) => SEG.test(p));
}

export function AddCronTaskModal({
  open,
  employees,
  projects,
  editingTask,
  onClose,
  onCreate,
  onUpdate,
}: AddCronTaskModalProps) {
  const isEdit = !!editingTask;
  const selectableEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          !e.internalOnly &&
          e.id !== "system" &&
          e.slug !== "system",
      ),
    [employees],
  );

  const [title, setTitle] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [skill, setSkill] = useState("");
  const [presetId, setPresetId] = useState<string>(PRESETS[0]!.id);
  const [customCron, setCustomCron] = useState("*/5 * * * *");
  const [humanLabel, setHumanLabel] = useState(PRESETS[0]!.label);
  const [humanLabelDirty, setHumanLabelDirty] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open. In edit mode, hydrate from the task; otherwise pick sane
  // defaults (first non-system agent, every-5-min preset).
  useEffect(() => {
    if (!open) return;
    if (editingTask) {
      setTitle(editingTask.title ?? "");
      setEmployeeId(editingTask.employee_id ?? "");
      setSkill(editingTask.skill ?? "");
      const cron = editingTask.schedule_cron ?? "";
      const matchingPreset = PRESETS.find((p) => p.cron === cron);
      if (matchingPreset) {
        setPresetId(matchingPreset.id);
        setCustomCron("*/5 * * * *");
      } else {
        setPresetId(CUSTOM_ID);
        setCustomCron(cron || "*/5 * * * *");
      }
      setHumanLabel(editingTask.human_label ?? "");
      // Mark dirty if the stored label diverges from any preset label, so the
      // preset toggle below doesn't clobber the user's custom wording.
      setHumanLabelDirty(
        !!editingTask.human_label &&
          !PRESETS.some((p) => p.label === editingTask.human_label),
      );
      setProjectId(editingTask.project_id ?? "");
    } else {
      setTitle("");
      setEmployeeId(selectableEmployees[0]?.id ?? "");
      setSkill("");
      setPresetId(PRESETS[0]!.id);
      setCustomCron("*/5 * * * *");
      setHumanLabel(PRESETS[0]!.label);
      setHumanLabelDirty(false);
      setProjectId("");
    }
    setSubmitting(false);
    setError(null);
  }, [open, selectableEmployees, editingTask]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isCustom = presetId === CUSTOM_ID;
  const cronExpr = isCustom
    ? customCron.trim()
    : (PRESETS.find((p) => p.id === presetId)?.cron ?? "");

  const cronPreview = describeCron(cronExpr);
  const cronValid = isValidCron(cronExpr);

  const handlePresetClick = (preset: Preset) => {
    setPresetId(preset.id);
    if (!humanLabelDirty) setHumanLabel(preset.label);
  };

  const handleCustomToggle = () => {
    setPresetId(CUSTOM_ID);
    if (!humanLabelDirty) setHumanLabel("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!employeeId) {
      setError("Pick an agent.");
      return;
    }
    if (!skill.trim()) {
      setError("Skill is required.");
      return;
    }
    if (!cronExpr || !cronValid) {
      setError("Schedule cron must have 5 space-separated fields.");
      return;
    }

    setSubmitting(true);
    const trimmedLabel = humanLabel.trim();
    const trimmedProject = projectId.trim();
    try {
      if (isEdit && editingTask && onUpdate) {
        const patch: UpdateCronTaskInput = {
          title: title.trim(),
          employee_id: employeeId,
          skill: skill.trim(),
          schedule_cron: cronExpr,
          human_label: trimmedLabel || null,
          project_id: trimmedProject || null,
        };
        const task = await onUpdate(editingTask.id, patch);
        if (!task) {
          setError("Could not save changes — see console for details.");
          setSubmitting(false);
          return;
        }
      } else {
        const input: CreateCronTaskInput = {
          title: title.trim(),
          employee_id: employeeId,
          skill: skill.trim(),
          schedule_cron: cronExpr,
        };
        if (trimmedLabel) input.human_label = trimmedLabel;
        if (trimmedProject) input.project_id = trimmedProject;
        const task = await onCreate(input);
        if (!task) {
          setError("Could not create task — see console for details.");
          setSubmitting(false);
          return;
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        className="card-surface w-full max-w-md p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">
              {isEdit ? "Edit Scheduled Task" : "New Scheduled Task"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {isEdit
                ? "Update agent, skill, or cadence. The scheduler re-syncs within 30s."
                : "Pick an agent + skill + cadence. The scheduler picks it up within 30s."}
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
              placeholder="e.g. Refresh inbound leads"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          <Field label="Agent" required>
            <div className="space-y-1.5">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
              >
                <option value="">Select an agent…</option>
                {selectableEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.role}
                  </option>
                ))}
              </select>
              {employeeId ? (
                <SelectedAgent
                  employee={selectableEmployees.find((e) => e.id === employeeId)}
                />
              ) : null}
            </div>
          </Field>

          <Field
            label="Skill"
            required
            hint="Free-form for V1 — e.g. 'inbox.triage' or 'leads.sync'."
          >
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="skill.name"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </Field>

          <Field label="Schedule" required>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handlePresetClick(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    presetId === p.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-strong bg-white text-secondary hover:bg-surface-muted",
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleCustomToggle}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  isCustom
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-strong bg-white text-secondary hover:bg-surface-muted",
                )}
              >
                Custom…
              </button>
            </div>
            {isCustom ? (
              <div className="mt-2 space-y-1">
                <input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="*/5 * * * *"
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-accent",
                    cronExpr && !cronValid
                      ? "border-status-error"
                      : "border-strong",
                  )}
                />
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted">
                    Format: min hour dom month dow
                  </span>
                  <span
                    className={cn(
                      cronValid
                        ? "text-secondary"
                        : "text-status-error",
                    )}
                  >
                    {cronValid
                      ? `preview: ${cronPreview ?? cronExpr}`
                      : "invalid: need 5 fields"}
                  </span>
                </div>
              </div>
            ) : null}
          </Field>

          <Field
            label="Human label"
            hint="Shown in the schedule list. Auto-fills from the preset."
          >
            <input
              value={humanLabel}
              onChange={(e) => {
                setHumanLabel(e.target.value);
                setHumanLabelDirty(true);
              }}
              placeholder="e.g. Every 5 minutes"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          <Field label="Project (optional)">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
                ? isEdit
                  ? "Saving…"
                  : "Adding…"
                : isEdit
                  ? "Save changes"
                  : "Schedule task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SelectedAgent({ employee }: { employee: Employee | undefined }) {
  if (!employee) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-subtle bg-surface-muted px-2 py-1.5">
      <AgentAvatar
        value={employee.avatar}
        name={employee.name}
        size={22}
        accent={employee.accent}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[11px] font-semibold text-primary">
          {employee.name}
        </div>
        <div className="truncate text-[10px] text-muted">
          {employee.role}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
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
      {hint ? (
        <span className="mt-1 block text-[10px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
