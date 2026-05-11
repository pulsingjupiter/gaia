"use client";
/**
 * RecentSessions — Overview right-rail widget showing the last N Claude
 * Code sessions across ALL projects, with one-click resume.
 *
 * Lives between ActivityFeed and ConversationsList in the right rail.
 * Uses `useRecentSessions` (10s poll + SSE-bumped `last_event_at`).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { AgentAvatar } from "@/components/shared/agent-avatar";
import { ResumeSessionButton } from "@/components/shared/resume-session-button";
import type { ProjectRow } from "@/lib/hooks/use-projects";
import type { SessionRow } from "@/lib/hooks/use-project-sessions";
import { useRecentSessions } from "@/lib/hooks/use-recent-sessions";

const STATUS_COLORS: Record<SessionRow["status"], string> = {
  active: "var(--status-online)",
  idle: "var(--status-busy)",
  ended: "var(--status-idle)",
};

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

function sessionLabel(s: SessionRow): string {
  const t = s.title?.trim();
  if (t) return t;
  return `${s.id.slice(0, 8)}…`;
}

export function RecentSessions() {
  const { sessions, projects } = useRecentSessions(5);
  const [, setTick] = useState(0);

  // Keep the relative timestamps fresh between polls.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="section-header">Recent Sessions</div>
          <div className="mt-0.5 text-[10px] text-muted">
            Across all projects
          </div>
        </div>
        <Link
          href="/activity"
          className="shrink-0 text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {sessions.length === 0 ? (
          <li className="px-1 py-3 text-xs leading-relaxed text-muted">
            No recent sessions yet. Run Claude Code anywhere on your Mac to
            see sessions appear here.
          </li>
        ) : null}
        {sessions.map((s) => {
          const project = projects[s.project_id] as ProjectRow | undefined;
          const projectName = project?.name ?? "Unknown project";
          const dotColor = project?.color ?? "#9CA3AF";
          return (
            <li key={s.id}>
              <Link
                href={`/projects/${s.project_id}/sessions/${s.id}`}
                className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-muted"
              >
                <AgentAvatar
                  value={project?.agent_avatar ?? null}
                  name={projectName}
                  size={22}
                  accent={dotColor}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px] font-semibold text-primary">
                    {projectName}
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    {sessionLabel(s)}
                  </div>
                </div>
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: STATUS_COLORS[s.status] }}
                    title={s.status}
                  />
                  <span className="text-[10px] text-muted">
                    {relativeTime(s.last_event_at)}
                  </span>
                  <ResumeSessionButton sessionId={s.id} variant="icon" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
