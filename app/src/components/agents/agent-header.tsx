"use client";
/**
 * Detail-page header — breadcrumb + big avatar + name/status/role + actions.
 */
import Link from "next/link";
import { ChevronRight, Pencil, Archive } from "lucide-react";

import type { EmployeeRow } from "@/lib/hooks/use-employees";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { AgentLaunchButton } from "@/components/shared/agent-launch-button";
import { cn } from "@/lib/cn";

const STATUS_PILL: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-status-online", label: "Online" },
  running: { dot: "bg-status-busy", label: "Busy" },
  error: { dot: "bg-status-error", label: "Error" },
  archived: { dot: "bg-status-idle", label: "Archived" },
};

export function AgentHeader({
  employee,
  onEdit,
  onArchive,
}: {
  employee: EmployeeRow;
  onEdit: () => void;
  onArchive: () => void;
}) {
  // The DELETE endpoint sets status='archived' which isn't part of the
  // normal idle|running|error union — widen the comparison via string.
  const statusKey = employee.status as string;
  const status = STATUS_PILL[statusKey] ?? STATUS_PILL.idle;
  const archived = statusKey === "archived";

  return (
    <div className="mb-5">
      <nav className="mb-3 flex items-center gap-1 text-xs text-muted">
        <Link href="/agents" className="hover:text-primary">
          Agents
        </Link>
        <ChevronRight size={12} />
        <span className="font-medium text-secondary">
          {employee.name}
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <AgentAvatar
            value={employee.avatar_emoji}
            name={employee.name}
            size={64}
            accent={employee.accent_color ?? "#9CA3AF"}
          />
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-[26px] font-bold leading-tight tracking-tight text-primary">
              {employee.name}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary",
                )}
              >
                <span className={cn("size-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
            </h1>
            <p className="mt-1 text-sm text-secondary">
              {employee.role || "—"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AgentLaunchButton
            agentId={employee.id}
            agentName={employee.name}
            variant="primary"
            disabled={archived}
          />
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-muted"
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={archived}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-status-error hover:bg-surface-muted disabled:opacity-50"
          >
            <Archive size={12} />
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
