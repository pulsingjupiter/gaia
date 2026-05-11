export function ProgressCard({
  title = "Working on it…",
  subtitle = "Gathering data and running the playbook.",
  progress,
}: {
  title?: string;
  subtitle?: string;
  progress?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress ?? 78)));
  return (
    <div className="card-surface mt-2 max-w-md p-4">
      <div className="text-sm font-semibold text-primary">
        {title}
      </div>
      <div className="mt-1 text-xs text-secondary">
        {subtitle}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold text-secondary">
          {pct}%
        </span>
      </div>
    </div>
  );
}

const DEFAULT_BULLETS: { label: string; body: string }[] = [
  {
    label: "Top Performing Video",
    body: "“Studio reset routine” drove 2.1× the average watch time and 18% higher saves.",
  },
  {
    label: "Best Posting Time",
    body: "8–10 PM SGT shows the strongest like-to-view ratio across the cohort.",
  },
  {
    label: "Retention Insight",
    body: "Average drop-off at 4.2s — consider an earlier hook or motion cut at 3s.",
  },
  {
    label: "Content Opportunity",
    body: "Quick comparison-style edits convert 1.4× better than talking-head formats.",
  },
];

export function ResultCard({
  title = "Result",
  bullets,
}: {
  title?: string;
  bullets?: { label: string; body: string }[];
}) {
  const items =
    bullets && bullets.length > 0 ? bullets : DEFAULT_BULLETS;
  return (
    <div className="card-surface mt-2 max-w-xl p-4">
      <div className="text-sm font-semibold text-primary">
        {title}
      </div>
      <ul className="mt-3 space-y-2.5">
        {items.map((b, i) => (
          <li key={`${b.label}-${i}`} className="flex gap-2 text-xs">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
            <div>
              <span className="font-semibold text-primary">{b.label}: </span>
              <span className="text-secondary">{b.body}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
