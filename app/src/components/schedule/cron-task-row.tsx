"use client";
/**
 * CronTaskRow — single row in the SCHEDULED TASKS table.
 *
 * Renders an enable/disable switch (writes immediately), the agent owner
 * (avatar + name), the human-friendly schedule, and last-run metadata.
 *
 * Edit opens the parent's modal in edit mode (parent owns `editingTask`
 * state). Delete uses an INLINE TWO-STEP CONFIRM pattern — first click swaps
 * the trash icon to a red checkmark labelled "Confirm" for ~3s, second click
 * commits the DELETE. Click outside or wait out the timer to abort. This
 * keeps the action discoverable but undo-able without a modal interrupt.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { cn } from "@/lib/cn";
import type { Employee } from "@/lib/types";
import type { TaskRow } from "@/lib/hooks/use-cron-tasks";

export type CronTaskRowProps = {
  task: TaskRow;
  employee: Employee | undefined;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit?: (task: TaskRow) => void;
  onDelete?: (id: string) => void;
  /**
   * Optional callback fired ~1s after a successful manual run kick-off, so the
   * parent can refresh the cron tasks list (and pick up the updated
   * `last_run_at`). Falls back to the 30s poll if not provided.
   */
  onFired?: (id: string) => void;
};

const CONFIRM_TIMEOUT_MS = 3000;
const FIRED_BADGE_MS = 2000;

export function CronTaskRow({
  task,
  employee,
  onToggle,
  onEdit,
  onDelete,
  onFired,
}: CronTaskRowProps) {
  const enabled = task.enabled === 1;
  const scheduleLabel = describeSchedule(task);
  const lastRun = task.last_run_at ? formatRelative(task.last_run_at) : null;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run-now state: `firing` blocks repeat clicks while the POST is in flight,
  // `fired` controls the inline "Fired" badge that fades after 2s.
  const [firing, setFiring] = useState(false);
  const [fired, setFired] = useState(false);
  const firedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canRunNow = Boolean(task.employee_id && task.skill);
  const runNowDisabled = !canRunNow || firing;
  const runNowTitle = !canRunNow
    ? "Task missing agent or skill"
    : firing
      ? "Firing…"
      : "Run once now";

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (firedTimerRef.current) clearTimeout(firedTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const handleRunNowClick = async () => {
    if (runNowDisabled) return;
    setFiring(true);
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}/run-now`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        // Swallow + log — surfacing a toast is the parent page's job once 5D
        // wires it. For now the button just stops showing "Firing".
        console.error("[run-now] failed", task.id, res.status);
        return;
      }
      setFired(true);
      if (firedTimerRef.current) clearTimeout(firedTimerRef.current);
      firedTimerRef.current = setTimeout(() => {
        setFired(false);
        firedTimerRef.current = null;
      }, FIRED_BADGE_MS);

      // Force a refresh ~1s after the kick-off — the run row + the task's
      // last_run_at should both have landed by then.
      if (onFired) {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          onFired(task.id);
          refreshTimerRef.current = null;
        }, 1000);
      }
    } catch (err) {
      console.error("[run-now] error", task.id, err);
    } finally {
      setFiring(false);
    }
  };

  const handleDeleteClick = () => {
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
        confirmTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingDelete(false);
    onDelete(task.id);
  };

  return (
    <tr
      className={cn(
        "border-t border-subtle text-xs",
        !enabled && "bg-surface-muted/40",
      )}
    >
      <td className="py-2.5 pl-3 pr-2 align-middle">
        <ToggleSwitch
          checked={enabled}
          onChange={(next) => onToggle(task.id, next)}
          ariaLabel={`Toggle ${task.title}`}
        />
      </td>
      <td className="py-2.5 pr-3 align-middle">
        <div
          className={cn(
            "font-medium text-primary",
            !enabled && "text-secondary",
          )}
        >
          {task.title}
        </div>
        {task.description ? (
          <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">
            {task.description}
          </div>
        ) : null}
      </td>
      <td className="py-2.5 pr-3 align-middle">
        {employee ? (
          <div className="flex items-center gap-1.5">
            <AgentAvatar
              value={employee.avatar}
              name={employee.name}
              size={20}
              accent={employee.accent}
            />
            <span className="truncate text-secondary">
              {employee.name}
            </span>
          </div>
        ) : (
          <span className="text-muted">
            {task.employee_id ?? "—"}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 align-middle">
        <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-secondary">
          {task.skill ?? "—"}
        </span>
      </td>
      <td className="py-2.5 pr-3 align-middle">
        <div className="text-secondary">{scheduleLabel}</div>
        {task.schedule_cron && task.schedule_cron !== scheduleLabel ? (
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            {task.schedule_cron}
          </div>
        ) : null}
      </td>
      <td className="py-2.5 pr-3 align-middle">
        {lastRun ? (
          <div className="text-secondary">{lastRun}</div>
        ) : (
          <span className="text-muted">Never</span>
        )}
      </td>
      <td className="py-2.5 pr-3 align-middle">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void handleRunNowClick();
            }}
            disabled={runNowDisabled}
            title={runNowTitle}
            aria-label="Run once now"
            className={cn(
              "rounded-md p-1.5 transition",
              runNowDisabled
                ? "cursor-not-allowed text-muted opacity-60"
                : "text-accent hover:bg-accent/10",
            )}
          >
            <PlayCircle size={12} />
          </button>
          {fired ? (
            <span
              role="status"
              className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
            >
              Fired
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit?.(task)}
            disabled={!onEdit}
            title="Edit"
            aria-label="Edit"
            className={cn(
              "rounded-md p-1.5 transition",
              onEdit
                ? "text-secondary hover:bg-surface-muted"
                : "cursor-not-allowed text-muted opacity-60",
            )}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDeleteClick}
            onBlur={() => {
              if (confirmTimerRef.current) {
                clearTimeout(confirmTimerRef.current);
                confirmTimerRef.current = null;
              }
              setConfirmingDelete(false);
            }}
            disabled={!onDelete}
            title={
              confirmingDelete
                ? `Confirm delete '${task.title}'`
                : "Delete permanently"
            }
            aria-label={confirmingDelete ? "Confirm delete" : "Delete"}
            className={cn(
              "rounded-md p-1.5 transition",
              !onDelete
                ? "cursor-not-allowed text-muted opacity-60"
                : confirmingDelete
                  ? "bg-status-error/15 text-status-error"
                  : "text-status-error hover:bg-status-error/10",
            )}
          >
            {confirmingDelete ? <Check size={12} /> : <Trash2 size={12} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-4 w-7 items-center rounded-full transition",
        checked ? "bg-accent" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block size-3 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/**
 * Convert a TaskRow's schedule into a human-readable string. We prefer the
 * stored `human_label` when present, then attempt to interpret common cron
 * shapes, then fall back to the raw cron expression.
 */
export function describeSchedule(task: Pick<TaskRow, "human_label" | "schedule_cron">): string {
  if (task.human_label && task.human_label.trim()) return task.human_label.trim();
  if (!task.schedule_cron) return "—";
  return describeCron(task.schedule_cron) ?? task.schedule_cron;
}

/**
 * A tiny, deliberately limited cron describer. Only handles the patterns the
 * preset picker emits plus a few obvious shapes — anything else falls
 * through to `null` so the caller can show the raw expression.
 *
 * Format: `min hour day-of-month month day-of-week`.
 */
export function describeCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];

  // Every N minutes — e.g. "*/5 * * * *"
  const minStep = matchStep(min);
  if (minStep && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    if (minStep === 1) return "Every minute";
    return `Every ${minStep} min`;
  }

  // Hourly — "0 * * * *"
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "Hourly";
  }

  // Every N hours — "0 */N * * *"
  const hourStep = matchStep(hour);
  if (
    /^\d+$/.test(min) &&
    hourStep &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Every ${hourStep} hr`;
  }

  // Specific hour shape: "M H ..."
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && mon === "*") {
    const time = formatHour(Number(hour), Number(min));
    if (dom === "*" && dow === "*") return `Daily ${time}`;
    if (dom === "*" && dow === "1-5") return `Weekdays ${time}`;
    if (dom === "*" && /^\d$/.test(dow)) {
      return `Weekly ${DOW_NAME[Number(dow)]} ${time}`;
    }
  }

  return null;
}

function matchStep(seg: string): number | null {
  const m = /^\*\/(\d+)$/.exec(seg);
  if (m) return Number(m[1]);
  if (seg === "*") return 1;
  return null;
}

const DOW_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatHour(h: number, m: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${display} ${ampm}`;
  return `${display}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}
