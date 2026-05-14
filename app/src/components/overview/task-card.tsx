"use client";
import { Clock, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import type { TaskRow } from "@/server/db";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatCadence(recurrence: string | null): string {
  if (!recurrence) return "One-off";
  return recurrence.charAt(0).toUpperCase() + recurrence.slice(1);
}

function formatDueTime(due: number | null): string {
  if (!due) return "No due date";
  const d = new Date(due);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDaysForRecurrence(recurrence: string | null, due: number | null): boolean[] {
  const days = [false, false, false, false, false, false, false];
  if (!recurrence) {
    if (due) {
      days[new Date(due).getDay()] = true;
    }
    return days;
  }
  if (recurrence === "daily") return [true, true, true, true, true, true, true];
  if (recurrence === "weekdays") return [false, true, true, true, true, true, false];
  if (due) {
    days[new Date(due).getDay()] = true;
  }
  return days;
}

export function TaskCard({
  task,
  onRun,
}: {
  task: TaskRow;
  /** Triggered when user clicks "Run now". Should resolve when the run is queued. */
  onRun?: (task: TaskRow) => Promise<void> | void;
}) {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!onRun) return;
    setRunning(true);
    try {
      await onRun(task);
    } finally {
      setRunning(false);
    }
  };

  const days = getDaysForRecurrence(task.recurrence, task.due_date);

  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-primary">
            {task.title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {formatCadence(task.recurrence)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              task.priority === "high"
                ? "bg-red-50 text-red-600"
                : task.priority === "medium"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-slate-50 text-slate-600"
            }`}
          >
            {task.priority}
          </span>
          {onRun ? (
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="inline-flex items-center gap-1 rounded-full border border-subtle bg-white px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent-soft disabled:opacity-60"
              aria-label="Run now"
              title="Run now"
            >
              {running ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <PlayCircle size={11} />
              )}
              Run
            </button>
          ) : null}
        </div>
      </div>

      {task.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-secondary">
          {task.description}
        </p>
      ) : null}

      {task.skill ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
            {task.skill}
          </span>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          {formatDueTime(task.due_date)}
        </div>
        <div className="flex gap-1">
          {DAY_LABELS.map((d, i) => {
            const on = days[i];
            return (
              <span
                key={i}
                className={
                  on
                    ? "inline-flex size-4 items-center justify-center rounded-full bg-accent text-[8px] font-semibold text-white"
                    : "inline-flex size-4 items-center justify-center rounded-full bg-surface-muted text-[8px] font-medium text-muted"
                }
              >
                {d}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
