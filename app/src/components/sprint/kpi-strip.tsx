"use client";
/**
 * SprintKpiStrip — counts derived from the live `tasks` table (status filtered
 * to the active-sprint columns: todo / in_progress / review / done — backlog
 * and archived are excluded).
 *
 * The page-level fetch (see `kanban-board.tsx`) is the single source of
 * truth; this component is purely presentational and accepts pre-computed
 * counts.
 */
export type SprintKpiStripProps = {
  planned: number;
  inProgress: number;
  review: number;
  completed: number;
};

export function SprintKpiStrip({
  planned,
  inProgress,
  review,
  completed,
}: SprintKpiStripProps) {
  const completionRate =
    planned > 0 ? Math.round((completed / planned) * 100) : 0;
  const inProgressPct =
    planned > 0 ? Math.round((inProgress / planned) * 100) : 0;
  const completedPct =
    planned > 0 ? Math.round((completed / planned) * 100) : 0;

  const items: Array<{
    label: string;
    value: string;
    chip?: string;
    chipColor?: string;
    spark?: boolean;
  }> = [
    { label: "Tasks Planned", value: String(planned) },
    {
      label: "In Progress",
      value: String(inProgress),
      chip: planned > 0 ? `${inProgressPct}%` : undefined,
      chipColor: "#5B5BD6",
    },
    {
      label: "Review",
      value: String(review),
    },
    {
      label: "Completed",
      value: String(completed),
      chip: planned > 0 ? `${completedPct}%` : undefined,
      chipColor: "#10B981",
    },
    {
      label: "Completion Rate",
      value: planned > 0 ? `${completionRate}%` : "—",
      spark: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="card-surface p-3">
          <div className="section-header text-[10px]">{it.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-primary">
              {it.value}
            </span>
            {it.chip ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: `${it.chipColor}1A`,
                  color: it.chipColor,
                }}
              >
                {it.chip}
              </span>
            ) : null}
            {it.spark ? (
              <svg width="60" height="20" viewBox="0 0 60 20" className="ml-auto">
                <polyline
                  points="0,16 10,12 20,14 30,8 40,10 50,4 60,6"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="1.5"
                />
              </svg>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
