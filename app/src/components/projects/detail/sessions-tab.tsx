"use client";
/**
 * SessionsTab — live table of Claude Code sessions for one project.
 *
 * Includes:
 *  - filter pills (All / Active / Idle / Ended)
 *  - search by title or session-id substring
 *  - "Resume Latest" button (resumes the most recently active session)
 *  - per-row Resume button + ⋯ menu (Copy command, Open transcript path)
 *  - live updates via `useProjectSessions` (which subscribes to SSE)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  MoreHorizontal,
  Search,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useProjectSessions } from "@/lib/hooks/use-project-sessions";
import type { SessionRow } from "@/lib/hooks/use-project-sessions";
import { useResumeSession } from "@/lib/hooks/use-resume-session";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { ResumeSessionButton } from "@/components/shared/resume-session-button";
import { formatCost, relativeTime, formatAbsolute } from "./format";

type Filter = "all" | "active" | "idle" | "ended";

/** Subset of the project row needed to render the agent avatar in rows. */
export type SessionsTabProject = {
  name: string;
  color: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
};

type Props = {
  projectId: string;
  /**
   * Optional project context — used to render the agent avatar in each
   * session row. When omitted, rows fall back to a status-only layout.
   */
  project?: SessionsTabProject;
};

const STATUS_COLORS: Record<SessionRow["status"], string> = {
  active: "var(--status-online)",
  idle: "var(--status-busy)",
  ended: "var(--status-idle)",
};

const DEFAULT_COLOR = "#5B5BD6";

export function SessionsTab({ projectId, project }: Props) {
  const { sessions, loading, error } = useProjectSessions(projectId);
  const { copy } = useResumeSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (term) {
        const hay =
          (s.title ?? "").toLowerCase() +
          " " +
          s.id.toLowerCase() +
          " " +
          (s.last_event_summary ?? "").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [sessions, filter, search]);

  const counts = useMemo(() => {
    return sessions.reduce(
      (acc, s) => {
        acc.all += 1;
        acc[s.status] += 1;
        return acc;
      },
      { all: 0, active: 0, idle: 0, ended: 0 } as Record<Filter, number>,
    );
  }, [sessions]);

  const latestSession = useMemo<SessionRow | null>(() => {
    if (sessions.length === 0) return null;
    // Sessions arrive ordered by last_event_at DESC.
    return sessions[0];
  }, [sessions]);

  async function handleCopyCommand(session: SessionRow): Promise<void> {
    setMenuOpenId(null);
    const result = await copy(session.id);
    if (!result.ok) {
      showToast(`Copy failed: ${result.error ?? "unknown error"}`);
      return;
    }
    if (
      result.command &&
      !(typeof navigator !== "undefined" && navigator.clipboard?.writeText)
    ) {
      // Clipboard API unavailable — surface the command for manual copy.
      showToast(result.command);
      return;
    }
    showToast("Resume command copied");
  }

  function handleOpenTranscript(session: SessionRow): void {
    setMenuOpenId(null);
    // We can't shell out from the browser; surface the path so the user can
    // copy it. Cheap V1 — better than nothing.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(session.transcript_path);
      showToast("Transcript path copied");
    } else {
      showToast(session.transcript_path);
    }
  }

  function showToast(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "idle", "ended"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                filter === f
                  ? "bg-accent text-white"
                  : "border border-strong bg-white text-secondary hover:bg-surface-muted",
              )}
            >
              <span className="capitalize">{f}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  filter === f
                    ? "bg-white/20"
                    : "bg-surface-muted text-muted",
                )}
              >
                {counts[f] ?? 0}
              </span>
            </button>
          ))}
          <div className="ml-1 flex items-center gap-1.5 rounded-lg border border-strong bg-white px-2.5 py-1.5">
            <Search size={12} className="text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions"
              className="w-44 bg-transparent text-xs text-primary outline-none placeholder:text-muted"
            />
          </div>
        </div>
        {latestSession ? (
          <ResumeSessionButton
            sessionId={latestSession.id}
            variant="primary"
            primaryLabelOverride="Resume Latest"
          />
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white opacity-50"
          >
            Resume Latest
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-status-error bg-red-50 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      <div className="card-surface overflow-hidden">
        {loading && sessions.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted">
            Loading sessions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted">
            {sessions.length === 0
              ? "No sessions yet. Run Claude Code in this project's directory to see them appear here."
              : "No sessions match your filter."}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="w-8 px-2 py-2 text-left"></th>
                <th className="w-6 px-1 py-2 text-left"></th>
                <th className="px-3 py-2 text-left font-semibold">Title</th>
                <th className="px-3 py-2 text-left font-semibold">Activity</th>
                <th className="px-3 py-2 text-left font-semibold">Started</th>
                <th className="px-3 py-2 text-left font-semibold">Last active</th>
                <th className="px-3 py-2 text-right font-semibold">Msgs</th>
                <th className="px-3 py-2 text-right font-semibold">Tools</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  projectId={projectId}
                  project={project}
                  menuOpen={menuOpenId === s.id}
                  setMenuOpen={(open) =>
                    setMenuOpenId(open ? s.id : null)
                  }
                  onCopy={() => handleCopyCommand(s)}
                  onOpenTranscript={() => handleOpenTranscript(s)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  projectId,
  project,
  menuOpen,
  setMenuOpen,
  onCopy,
  onOpenTranscript,
}: {
  session: SessionRow;
  projectId: string;
  project?: SessionsTabProject;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onCopy: () => void;
  onOpenTranscript: () => void;
}) {
  const title = session.title?.trim() || `${session.id.slice(0, 8)}…`;
  const activity = formatActivity(session);
  const accent = project?.color ?? DEFAULT_COLOR;
  const avatarName = project?.agent_name ?? project?.name ?? "Agent";
  return (
    <tr className="border-t border-subtle hover:bg-surface-muted">
      <td className="px-2 py-2">
        <AgentAvatar
          value={project?.agent_avatar ?? null}
          name={avatarName}
          size={24}
          accent={accent}
        />
      </td>
      <td className="px-1 py-2">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: STATUS_COLORS[session.status] }}
          title={session.status}
        />
      </td>
      <td className="px-3 py-2">
        <Link
          href={`/projects/${projectId}/sessions/${session.id}`}
          className="font-medium text-primary hover:text-accent"
        >
          {title}
        </Link>
      </td>
      <td
        className="max-w-[260px] truncate px-3 py-2 text-secondary"
        title={activity}
      >
        {activity}
      </td>
      <td
        className="px-3 py-2 text-muted"
        title={formatAbsolute(session.started_at)}
      >
        {relativeTime(session.started_at)}
      </td>
      <td
        className="px-3 py-2 text-muted"
        title={formatAbsolute(session.last_event_at)}
      >
        {relativeTime(session.last_event_at)}
      </td>
      <td className="px-3 py-2 text-right text-secondary">
        {session.num_messages}
      </td>
      <td className="px-3 py-2 text-right text-secondary">
        {session.num_tool_uses}
      </td>
      <td
        className="px-3 py-2 text-right text-secondary"
        title="Estimated from token counts"
      >
        {formatCost(session.total_cost_usd)}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="relative inline-flex items-center justify-end gap-1">
          <ResumeSessionButton sessionId={session.id} variant="compact" />
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="More"
            className="rounded-md border border-strong bg-white p-1 text-secondary hover:bg-surface-muted"
          >
            <MoreHorizontal size={12} />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-7 z-10 min-w-[180px] rounded-lg border border-strong bg-white py-1 text-left shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={onCopy}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-secondary hover:bg-surface-muted"
              >
                <Copy size={11} /> Copy resume command
              </button>
              <button
                type="button"
                onClick={onOpenTranscript}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-secondary hover:bg-surface-muted"
              >
                <ExternalLink size={11} /> Copy transcript path
              </button>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function formatActivity(session: SessionRow): string {
  const tool = session.last_tool;
  const file = session.last_file;
  const summary = session.last_event_summary;
  if (tool && file) {
    if (/^read/i.test(tool)) return `Reading \`${file}\``;
    if (/^write/i.test(tool) || /^edit/i.test(tool))
      return `Writing \`${file}\``;
    if (/^bash/i.test(tool)) return `Bash: \`${file}\``;
    return `${tool}: \`${file}\``;
  }
  if (tool) return tool;
  if (summary) return summary;
  return "—";
}
