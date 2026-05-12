"use client";
/**
 * ProjectHeader — breadcrumb, title, status pill, agent persona chip,
 * Edit + ⋯ menu (Archive). Sits above the tab bar on the project detail page.
 */
import { useState } from "react";
import Link from "next/link";
import { Archive, ChevronRight, MoreHorizontal, Pencil, Sparkles, Wand2 } from "lucide-react";

import { IconGlyph } from "../icon-glyph";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import type { ProjectRow, ProjectStats } from "@/lib/hooks/use-project-detail";

type Props = {
  project: ProjectRow;
  stats: ProjectStats | null;
  onEdit: () => void;
  onArchive: () => void;
  onPlanWithClaude?: () => void;
  onAssess?: () => void;
};

const DEFAULT_COLOR = "#5B5BD6";

function deriveStatus(
  project: ProjectRow,
  stats: ProjectStats | null,
): { label: string; color: string } {
  if (project.archived) {
    return { label: "Archived", color: "var(--status-idle)" };
  }
  if (stats && stats.active_count > 0) {
    return { label: "Active", color: "var(--status-online)" };
  }
  if (stats && stats.last_event_at) {
    const ageMs = Date.now() - stats.last_event_at;
    if (ageMs < 30 * 60 * 1000) {
      return { label: "Idle", color: "var(--status-busy)" };
    }
  }
  return { label: "Idle", color: "var(--status-idle)" };
}

export function ProjectHeader({
  project,
  stats,
  onEdit,
  onArchive,
  onPlanWithClaude,
  onAssess,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = project.color ?? DEFAULT_COLOR;
  const status = deriveStatus(project, stats);

  return (
    <div className="flex items-start justify-between gap-4 pb-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Link
            href="/projects"
            className="hover:text-secondary"
          >
            Projects
          </Link>
          <ChevronRight size={12} />
          <span className="truncate text-secondary">
            {project.name}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3">
          {/* Agent persona avatar (prominent). The original IconGlyph
              represents the project itself — kept as a small badge
              alongside when available so both identities can show. */}
          <AgentAvatar
            value={project.agent_avatar}
            name={project.agent_name ?? project.name}
            size={48}
            accent={color}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {project.icon ? (
                <IconGlyph
                  icon={project.icon}
                  fallback={project.name}
                  color={color}
                  size={20}
                />
              ) : null}
              <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight text-primary">
                {project.name}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary"
                title={`Status: ${status.label}`}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: status.color }}
                />
                {status.label}
              </span>
              {project.agent_name ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: `${color}1A`, color }}
                >
                  {project.agent_name}
                </span>
              ) : null}
            </div>
            <div
              className="mt-0.5 truncate font-mono text-[12px] text-muted"
              title={project.path}
            >
              {project.path}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-2">
        {onPlanWithClaude ? (
          <button
            type="button"
            onClick={onPlanWithClaude}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            <Sparkles size={12} />
            Plan with Gaia
          </button>
        ) : null}
        {onAssess ? (
          <button
            type="button"
            onClick={onAssess}
            title="Auto-assess this project from files + sessions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            <Wand2 size={12} />
            Gaia AI Assess
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          <Pencil size={12} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Project options"
          className="rounded-md border border-strong bg-white p-1.5 text-secondary hover:bg-surface-muted"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-10 z-10 min-w-[180px] rounded-lg border border-strong bg-white py-1 shadow-md"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onArchive();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-status-error hover:bg-surface-muted"
            >
              <Archive size={12} />
              Archive Project
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
