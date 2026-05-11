"use client";
/**
 * SessionHeader — top bar with breadcrumb, title, status pill, metadata
 * sub-line, and the Resume button + ⋯ menu.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Copy, FileText, MoreHorizontal } from "lucide-react";

import { ResumeSessionButton } from "@/components/shared/resume-session-button";
import type { ProjectRow } from "@/lib/hooks/use-project-detail";
import type { SessionRow } from "@/lib/hooks/use-session-detail";

function statusTone(status: SessionRow["status"]): { dot: string; label: string; bg: string } {
  if (status === "active")
    return { dot: "var(--status-online)", label: "Active", bg: "rgba(16,185,129,0.12)" };
  if (status === "idle")
    return { dot: "var(--status-busy)", label: "Idle", bg: "rgba(245,158,11,0.12)" };
  return { dot: "var(--status-idle)", label: "Ended", bg: "rgba(156,163,175,0.16)" };
}

function relTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function startedAt(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCost(usd: number): string {
  if (!usd) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function SessionHeader({
  project,
  session,
  onCopyCommand,
  onShowTranscriptPath,
  onShowRawJsonl,
  toast,
}: {
  project: ProjectRow | null;
  session: SessionRow;
  onCopyCommand: () => void;
  onShowTranscriptPath: () => void;
  onShowRawJsonl: () => void;
  toast: string | null;
}) {
  const tone = statusTone(session.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const projectName = project?.name ?? "Project";
  const sessionLabel = session.title ?? session.id.slice(0, 8);

  return (
    <header className="border-b border-subtle bg-white px-6 py-4">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/" className="hover:text-secondary">
          Projects
        </Link>
        <ChevronRight size={12} />
        {project ? (
          <Link
            href={`/projects/${encodeURIComponent(project.id)}`}
            className="hover:text-secondary"
          >
            {projectName}
          </Link>
        ) : (
          <span>{projectName}</span>
        )}
        <ChevronRight size={12} />
        <span className="truncate text-secondary">{sessionLabel}</span>
      </nav>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-semibold text-primary">
              {sessionLabel}
            </h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: tone.bg, color: "var(--text-secondary)" }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: tone.dot }}
              />
              {tone.label}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>Started {startedAt(session.started_at)}</span>
            <span>·</span>
            <span>Last active {relTime(session.last_event_at)}</span>
            <span>·</span>
            <span>{session.num_messages} msgs</span>
            <span>·</span>
            <span>{session.num_tool_uses} tool uses</span>
            <span>·</span>
            <span>{fmtCost(session.total_cost_usd)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {toast ? (
            <span className="rounded-md border border-subtle bg-white px-3 py-1.5 text-xs text-secondary shadow-sm">
              {toast}
            </span>
          ) : null}
          <ResumeSessionButton sessionId={session.id} variant="primary" />
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-9 items-center justify-center rounded-lg border border-subtle bg-white text-secondary hover:bg-surface-hover"
              aria-label="More actions"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-10 mt-1.5 w-60 overflow-hidden rounded-lg border border-subtle bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onCopyCommand();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover"
                >
                  <Copy size={14} />
                  Copy resume command
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowTranscriptPath();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover"
                >
                  <FileText size={14} />
                  Open transcript path
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowRawJsonl();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover"
                >
                  <FileText size={14} />
                  View raw JSONL (TODO)
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
