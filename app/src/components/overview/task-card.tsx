"use client";
import { Clock, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import type { OverviewTask } from "@/lib/mock/tasks";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function TaskCard({
  task,
  onRun,
}: {
  task: OverviewTask;
  /** Triggered when user clicks "Run now". Should resolve when the run is queued. */
  onRun?: (task: OverviewTask) => Promise<void> | void;
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

  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-primary">
            {task.title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {task.cadence}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {task.chips ? (
            <div className="flex gap-1">
              {task.chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-surface-muted px-1.5 text-[10px] font-semibold text-secondary"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
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

      {task.body ? (
        <p className="mt-2 line-clamp-2 text-xs text-secondary">
          {task.body}
        </p>
      ) : null}

      {task.tags ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          {task.time}
        </div>
        <div className="flex gap-1">
          {DAY_LABELS.map((d, i) => {
            const on = task.days?.[i];
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
