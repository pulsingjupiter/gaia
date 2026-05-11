"use client";
/**
 * ContextRail — right-hand cards (Project, Tools used, Files touched, Cost).
 *
 * Data is derived client-side from the transcript events + project row, so
 * no extra API calls are needed for V1.
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { IconGlyph } from "@/components/projects/icon-glyph";
import type { ProjectRow } from "@/lib/hooks/use-project-detail";
import type { ParsedEvent } from "@/lib/hooks/use-session-transcript";

function fmtUsd(n: number): string {
  if (!n) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function CardShell({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="section-header">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ContextRail({
  project,
  events,
  totalCost,
}: {
  project: ProjectRow | null;
  events: ParsedEvent[];
  totalCost: number;
}) {
  // Tools-used: tally the last 10 tool_use events (not tool_results).
  const toolUses = events.filter((e) => e.role === "tool" && e.tool_name).slice(-10);
  const toolCounts = new Map<string, number>();
  for (const e of toolUses) {
    if (!e.tool_name) continue;
    toolCounts.set(e.tool_name, (toolCounts.get(e.tool_name) ?? 0) + 1);
  }
  const toolEntries = Array.from(toolCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Files-touched: walk events backwards, grab unique file paths from tool_input.
  const seenFiles = new Set<string>();
  const filesTouched: string[] = [];
  for (let i = events.length - 1; i >= 0 && filesTouched.length < 5; i--) {
    const e = events[i];
    if (!e || e.role !== "tool") continue;
    const inp = e.tool_input;
    if (!inp || typeof inp !== "object") continue;
    const obj = inp as Record<string, unknown>;
    for (const k of ["file_path", "path", "notebook_path", "filename"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim() && !seenFiles.has(v)) {
        seenFiles.add(v);
        filesTouched.push(v);
        break;
      }
    }
  }

  return (
    <aside className="scroll-thin flex h-full w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-subtle bg-page p-4">
      <CardShell
        title="Project"
        action={
          project ? (
            <Link
              href={`/projects/${encodeURIComponent(project.id)}`}
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Open <ExternalLink size={11} />
            </Link>
          ) : null
        }
      >
        {project ? (
          <div className="flex items-start gap-3">
            <IconGlyph
              icon={project.icon}
              fallback={project.name.slice(0, 1)}
              color={project.color ?? "#5B5BD6"}
              size={32}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-primary">
                {project.name}
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                {project.path}
              </div>
              {project.agent_name ? (
                <div className="mt-1 text-xs text-secondary">
                  Agent · {project.agent_name}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">No project linked.</p>
        )}
      </CardShell>

      <CardShell title="Tools used">
        {toolEntries.length === 0 ? (
          <p className="text-xs text-muted">No tools yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {toolEntries.map(([name, count]) => (
              <li
                key={name}
                className="flex items-center justify-between text-sm text-primary"
              >
                <span>{name}</span>
                <span className="text-xs text-muted">× {count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      <CardShell title="Files touched">
        {filesTouched.length === 0 ? (
          <p className="text-xs text-muted">No files yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {filesTouched.map((f) => (
              <li
                key={f}
                title={f}
                className="truncate font-mono text-[11px] text-secondary"
              >
                {f}
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      <CardShell title="Cost breakdown">
        <div className="text-2xl font-semibold text-primary">
          {fmtUsd(totalCost)}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Estimated from token counts at Sonnet 4.x rates.
        </p>
      </CardShell>
    </aside>
  );
}
