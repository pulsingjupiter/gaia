"use client";
/**
 * Right-rail summary for the agent detail view. Pure presentational —
 * gets the employee row + run aggregates from the parent.
 *
 * The "Tools / Files" tile grid uses a hardcoded fallback list for V1
 * (Bash, Read, Write, Edit, Grep, WebSearch) because tool inventory isn't
 * yet wired up to the DB. When that lands we can swap the source without
 * touching the layout.
 */
import {
  FileText,
  FileEdit,
  Search as SearchIcon,
  Globe,
  Terminal,
  PenLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { EmployeeRow } from "@/lib/hooks/use-employees";

const FALLBACK_TOOLS: { name: string; Icon: LucideIcon }[] = [
  { name: "Bash", Icon: Terminal },
  { name: "Read", Icon: FileText },
  { name: "Write", Icon: PenLine },
  { name: "Edit", Icon: FileEdit },
  { name: "Grep", Icon: SearchIcon },
  { name: "WebSearch", Icon: Globe },
];

function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(4)}`;
}

function fmtDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_DOT: Record<string, string> = {
  idle: "bg-status-online",
  running: "bg-status-busy",
  error: "bg-status-error",
  archived: "bg-status-idle",
};

export function AgentRail({
  employee,
  totalRuns,
  totalCost,
}: {
  employee: EmployeeRow;
  totalRuns: number;
  totalCost: number;
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-4">
      <section className="card-surface p-4">
        <div className="section-header">About</div>
        <dl className="mt-3 space-y-2.5 text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted">
              Agent dir
            </dt>
            <dd className="mt-0.5 break-all font-mono text-[10.5px] text-secondary">
              {employee.agent_dir}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Created</dt>
            <dd className="text-secondary">
              {fmtDate(employee.created_at)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Status</dt>
            <dd className="inline-flex items-center gap-1.5 capitalize text-secondary">
              <span
                className={`size-1.5 rounded-full ${STATUS_DOT[employee.status] ?? "bg-status-idle"}`}
              />
              {employee.status}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Recent runs</dt>
            <dd className="font-medium text-secondary">
              {totalRuns}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Recent cost</dt>
            <dd className="font-mono text-secondary">
              {fmtCost(totalCost)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card-surface p-4">
        <div className="section-header">Tools / Files</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {FALLBACK_TOOLS.map((t) => {
            const Icon = t.Icon;
            return (
              <div
                key={t.name}
                className="flex flex-col items-center gap-1 rounded-lg border border-subtle bg-surface-muted py-2 text-[10.5px] font-medium text-secondary"
                title={t.name}
              >
                <Icon size={14} className="text-secondary" />
                {t.name}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-muted">
          Default toolset shown. Per-agent overrides will appear here once
          wired up.
        </p>
      </section>
    </aside>
  );
}
