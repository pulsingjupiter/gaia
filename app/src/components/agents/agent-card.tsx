"use client";
/**
 * AgentCard — list-page tile. Click navigates to /agents/[id]; the ⋯ menu
 * fires Edit / Archive callbacks supplied by the parent.
 *
 * Stats (recent run count, avg cost) are passed in by the parent so the
 * list page can fetch them once via /api/runs?stats=1 instead of per-card.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { Employee } from "@/lib/types";
import { RUNTIME_LABELS } from "@/lib/types";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { AgentLaunchButton } from "@/components/shared/agent-launch-button";
import { cn } from "@/lib/cn";

type Stats = {
  runs: number;
  avgCostUsd: number;
};

const STATUS_DOT: Record<Employee["status"], string> = {
  Online: "bg-status-online",
  Busy: "bg-status-busy",
  Idle: "bg-status-idle",
};

const STATUS_LABEL: Record<Employee["status"], string> = {
  Online: "Online",
  Busy: "Busy",
  Idle: "Idle",
};

function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function AgentCard({
  employee,
  stats,
  onEdit,
  onArchive,
}: {
  employee: Employee;
  stats: Stats;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / ESC closes the kebab menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <Link
      href={`/agents/${encodeURIComponent(employee.id)}`}
      className="card-surface group relative flex flex-col overflow-hidden p-4 pl-5 transition hover:-translate-y-px hover:border-accent hover:shadow-sm"
    >
      {/* Accent stripe */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: employee.accent }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AgentAvatar
            value={employee.avatar}
            name={employee.name}
            size={56}
            accent={employee.accent}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="truncate text-[18px] font-semibold leading-tight text-primary">
                {employee.name}
              </div>
              {employee.runtime !== "claude" ? (
                <span
                  title={`${RUNTIME_LABELS[employee.runtime]} runtime`}
                  className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
                >
                  {RUNTIME_LABELS[employee.runtime]}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-xs text-secondary">
              {employee.role || "—"}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[employee.status])} />
              {STATUS_LABEL[employee.status]}
            </div>
          </div>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Agent actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="rounded-md p-1 text-muted opacity-0 transition hover:bg-surface-muted group-hover:opacity-100"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-7 z-10 w-32 rounded-lg border border-strong bg-white py-1 shadow-lg"
              onClick={(e) => e.preventDefault()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  onEdit();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-secondary hover:bg-surface-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  onArchive();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-status-error hover:bg-surface-muted"
              >
                Archive
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-subtle pt-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
            {stats.runs} {stats.runs === 1 ? "run" : "runs"}
          </span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
            {fmtCost(stats.avgCostUsd)} avg
          </span>
        </div>
        <AgentLaunchButton
          agentId={employee.id}
          agentName={employee.name}
          variant="inline"
        />
      </div>
    </Link>
  );
}
