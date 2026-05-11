"use client";
/**
 * /sprint — kanban board over the live `tasks` table.
 *
 * Tasks with status `backlog` or `archived` are excluded; everything else
 * (todo / in_progress / review / done) is grouped into four columns.
 * Drag-drop fires PATCH /api/backlog/[id] with the new status.
 *
 * The board owns the fetch and reports counts up via `onCountsChange` so the
 * KPI strip stays in sync without a second request. The "This week" badge is
 * informational only — Timeline / Calendar tabs and team/playbook filters are
 * deferred to V5; we surface them with a "Coming in V5" tooltip rather than
 * showing inert UI without explanation.
 */
import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SprintKpiStrip } from "@/components/sprint/kpi-strip";
import { KanbanBoard, type KanbanCounts } from "@/components/sprint/kanban-board";

const TABS: { label: string; tooltip?: string }[] = [
  { label: "Board" },
  { label: "Timeline", tooltip: "Coming in V5" },
  { label: "Calendar", tooltip: "Coming in V5" },
];

export default function SprintPage() {
  const [counts, setCounts] = useState<KanbanCounts>({
    planned: 0,
    inProgress: 0,
    review: 0,
    completed: 0,
  });

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Sprint"
        subtitle="Track progress across tasks promoted out of project backlogs."
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary">
              This week
            </span>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Open Backlog
            </Link>
          </div>
        }
      />

      <SprintKpiStrip
        planned={counts.planned}
        inProgress={counts.inProgress}
        review={counts.review}
        completed={counts.completed}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-subtle">
        <div className="flex gap-6">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              type="button"
              disabled={i !== 0}
              title={t.tooltip}
              className={
                i === 0
                  ? "border-b-2 border-accent pb-2 text-sm font-semibold text-accent"
                  : "cursor-not-allowed pb-2 text-sm text-muted opacity-60"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <KanbanBoard onCountsChange={setCounts} />
      </div>
    </div>
  );
}
