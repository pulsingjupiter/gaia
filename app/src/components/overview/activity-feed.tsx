"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { useActivityFeed } from "@/lib/hooks/use-activity-feed";

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const KIND_VERB: Record<string, string> = {
  started: "started",
  tool_use: "used a tool",
  message: "said",
  done: "finished",
  error: "errored",
};

export function ActivityFeed() {
  const { employees } = useEmployees();
  const { entries, pulse, connected } = useActivityFeed();
  const [, setTick] = useState(0);

  // Re-render every 30s so relative times stay fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="section-header">Activity Feed</div>
          {connected ? (
            <span
              key={pulse}
              className="size-1.5 animate-ping rounded-full bg-status-online"
              aria-label="Live"
            />
          ) : null}
        </div>
        <Link
          href="/activity"
          className="text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {entries.length === 0 ? (
          <li className="text-xs text-muted">
            No activity yet — run a task to get started.
          </li>
        ) : null}
        {entries.map((a) => {
          const e = a.employee_id
            ? employees.find((emp) => emp.id === a.employee_id)
            : null;
          return (
            <li key={a.id} className="flex items-start gap-2.5">
              <Avatar
                initials={e?.initials ?? "??"}
                color={e?.accent ?? "#9CA3AF"}
                size={26}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-xs">
                  <span className="font-semibold text-primary">
                    {e?.name ?? "Run"}
                  </span>{" "}
                  <span className="text-secondary">
                    {KIND_VERB[a.kind] ?? a.kind}
                  </span>
                </div>
                <div className="truncate text-xs text-secondary">
                  {a.summary}
                </div>
                <div className="text-[10px] text-muted">
                  {relativeTime(a.ts)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
