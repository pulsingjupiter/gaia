"use client";
/**
 * ProjectStatusStrip — compact one-liner between the project header and the
 * tab strip. Reads from /api/tasks/summary?project_id= via
 * useTaskDueSummary. Numbers are clickable links into /tasks with the
 * relevant filter applied so the rollup doubles as navigation.
 *
 * Hidden until at least one task exists on the project (avoids a noisy
 * "0 tasks" line on brand-new projects).
 */
import Link from "next/link";

import { cn } from "@/lib/cn";
import { useTaskDueSummary } from "@/lib/hooks/use-task-due-summary";

export function ProjectStatusStrip({ projectId }: { projectId: string }) {
  const { summary, loading } = useTaskDueSummary(projectId);
  if (loading) return <div className="h-6" />;
  if (summary.total === 0 && summary.overdue === 0 && summary.due_this_week === 0)
    return null;

  const pBase = `/tasks?project=${encodeURIComponent(projectId)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3 text-xs">
      <Link
        href={pBase}
        className="text-muted hover:text-secondary"
      >
        <span className="font-semibold text-secondary">{summary.total}</span>{" "}
        task{summary.total === 1 ? "" : "s"}
      </Link>
      <span className="text-muted">·</span>
      <Link
        href={`${pBase}&due=this_week`}
        className={cn(
          "hover:underline",
          summary.due_this_week > 0 ? "text-amber-600 font-medium" : "text-muted",
        )}
      >
        {summary.due_this_week} due this week
      </Link>
      <span className="text-muted">·</span>
      <Link
        href={`${pBase}&due=overdue`}
        className={cn(
          "hover:underline",
          summary.overdue > 0
            ? "font-semibold text-status-error"
            : "text-muted",
        )}
      >
        {summary.overdue} overdue
      </Link>
    </div>
  );
}
