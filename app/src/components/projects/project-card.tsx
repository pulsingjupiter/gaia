"use client";
/**
 * ProjectCard — single tile in the /projects grid.
 *
 * Visual contract:
 *   - 4–6px color stripe at the top (project's color)
 *   - Header: icon + name + ⋯ menu
 *   - Path (truncated middle, monospace, muted)
 *   - "Now" line: live activity status
 *   - Stats row: sessions • cost • last-active relative time
 *   - Bottom: agent persona pill, "Auto-discovered" pill if heuristic matches
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, MoreHorizontal } from "lucide-react";
import { IconGlyph } from "./icon-glyph";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { cn } from "@/lib/cn";
import type { ProjectWithStats } from "@/lib/hooks/use-projects";

type Props = {
  project: ProjectWithStats;
  /** Latest summary text for an active session, if any. */
  liveSummary?: string | null;
  /** Bumped every time the session-stream fires for this project. */
  pulseKey?: number;
  onArchive?: (id: string) => void;
};

const DEFAULT_COLOR = "#5B5BD6";

function truncatePath(p: string, max = 42): string {
  if (p.length <= max) return p;
  const head = p.slice(0, Math.floor(max / 2) - 1);
  const tail = p.slice(p.length - Math.floor(max / 2));
  return `${head}…${tail}`;
}

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 30_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function isAutoDiscovered(project: ProjectWithStats): boolean {
  // Heuristic: name equals path basename and no description.
  if (project.description) return false;
  const basename = project.path.split("/").filter(Boolean).pop() ?? "";
  return project.name === basename;
}

export function ProjectCard({ project, liveSummary, pulseKey, onArchive }: Props) {
  const color = project.color ?? DEFAULT_COLOR;
  const isActive = (project.stats.active_count ?? 0) > 0;
  const stats = project.stats;
  const [menuOpen, setMenuOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pulseKey === undefined) return;
    setPulse(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPulse(false), 1400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pulseKey]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((o) => !o);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onArchive?.(project.id);
  };

  const autoDiscovered = isAutoDiscovered(project);

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "card-surface group relative flex flex-col overflow-hidden p-0 transition",
        "hover:-translate-y-0.5 hover:shadow-md",
      )}
      style={{ borderColor: pulse ? color : undefined }}
    >
      {/* Color stripe */}
      <div className="h-[5px] w-full" style={{ background: color }} />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <IconGlyph
              icon={project.icon}
              fallback={project.name}
              color={color}
              size={36}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-primary">
                {project.name}
              </div>
              <div className="truncate font-mono text-[11px] text-muted">
                {truncatePath(project.path)}
              </div>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={handleMenuClick}
              aria-label="Project options"
              className="rounded-md p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface-muted"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-7 z-10 min-w-[140px] rounded-lg border border-strong bg-white py-1 shadow-md"
              >
                <button
                  type="button"
                  onClick={handleArchive}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-secondary hover:bg-surface-muted"
                >
                  <Archive size={12} />
                  Archive
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Now line */}
        <div className="mt-3 flex min-h-[20px] items-center gap-2 text-xs">
          {isActive ? (
            <>
              <span className="relative inline-flex">
                <span
                  className="size-2 rounded-full"
                  style={{ background: "var(--status-online)" }}
                />
                <span
                  className={cn(
                    "absolute inset-0 size-2 rounded-full",
                    pulse ? "animate-ping" : "animate-pulse",
                  )}
                  style={{ background: "var(--status-online)" }}
                />
              </span>
              <span className="truncate text-secondary">
                <span className="font-medium text-primary">
                  {project.agent_name ?? "Active"}
                </span>
                {liveSummary ? (
                  <span className="text-muted"> — {liveSummary}</span>
                ) : null}
              </span>
            </>
          ) : stats.sessions_count > 0 && stats.last_event_at ? (
            <>
              <span className="size-2 rounded-full bg-status-idle" />
              <span className="text-muted">
                Last activity {relativeTime(stats.last_event_at)}
              </span>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-status-idle" />
              <span className="text-muted">Idle</span>
            </>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>
            <span className="font-semibold text-secondary">
              {stats.sessions_count}
            </span>{" "}
            session{stats.sessions_count === 1 ? "" : "s"}
          </span>
          <span aria-hidden>•</span>
          <span>
            <span className="font-semibold text-secondary">
              ${stats.total_cost_usd.toFixed(2)}
            </span>
          </span>
          <span aria-hidden>•</span>
          <span>{relativeTime(stats.last_event_at)}</span>
        </div>

        {/* Footer pills */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {project.agent_name ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${color}1A`, color }}
            >
              {project.agent_name}
            </span>
          ) : null}
          {autoDiscovered ? (
            <span className="inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
              Auto-discovered
            </span>
          ) : null}
          {project.is_internal ? (
            <span className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
              Internal
            </span>
          ) : null}
          {/* Agent persona avatar — bottom-right of card. Falls back to
              initials of project name when no avatar is set. */}
          <span className="ml-auto transition group-hover:[&>span]:ring-2 group-hover:[&>span]:ring-white">
            <AgentAvatar
              value={project.agent_avatar}
              name={project.agent_name ?? project.name}
              size={24}
              accent={color}
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
