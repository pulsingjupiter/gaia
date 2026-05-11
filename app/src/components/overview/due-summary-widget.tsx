"use client";
/**
 * DueSummaryWidget — global Tasks urgency rollup for the Overview right rail.
 *
 * Reads /api/tasks/summary (no project scope), 60s poll. Renders three rows:
 * overdue, due this week, in progress. Empty state when all rollups are zero.
 * Rows are clickable links into /tasks with the corresponding `?due=` filter.
 */
import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";

import { useTaskDueSummary } from "@/lib/hooks/use-task-due-summary";

export function DueSummaryWidget() {
  const { summary } = useTaskDueSummary(null);
  const empty =
    summary.overdue === 0 &&
    summary.due_this_week === 0 &&
    summary.in_progress === 0;

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: "#EEEAFD" }}
          >
            <ClipboardList size={16} color="#5B5BD6" />
          </div>
          <div className="section-header">Tasks</div>
        </div>
        <Link
          href="/tasks"
          className="text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>

      {empty ? (
        <div className="rounded-lg bg-surface-muted px-3 py-4 text-center text-[11px] text-muted">
          No tasks need attention
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {summary.overdue > 0 ? (
            <Row
              href="/tasks?due=overdue"
              label="overdue"
              count={summary.overdue}
              tone="error"
            />
          ) : null}
          {summary.due_this_week > 0 ? (
            <Row
              href="/tasks?due=this_week"
              label="due this week"
              count={summary.due_this_week}
              tone="warn"
            />
          ) : null}
          {summary.in_progress > 0 ? (
            <Row
              href="/tasks"
              label="in progress"
              count={summary.in_progress}
              tone="info"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Row({
  href,
  count,
  label,
  tone,
}: {
  href: string;
  count: number;
  label: string;
  tone: "error" | "warn" | "info";
}) {
  const toneClass =
    tone === "error"
      ? "text-status-error font-semibold"
      : tone === "warn"
        ? "text-amber-600 font-semibold"
        : "text-secondary";
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-surface-muted"
    >
      <span className={toneClass}>
        {count} {label}
      </span>
      <ChevronRight size={12} className="text-muted" />
    </Link>
  );
}
