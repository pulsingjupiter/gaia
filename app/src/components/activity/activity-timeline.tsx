"use client";
/**
 * ActivityTimeline — vertical reverse-chronological list with sticky day
 * headers ("Today", "Yesterday", date) and clickable rows.
 *
 * Run rows open the LiveRunDrawer. Session rows route to the per-session
 * page in /projects/<project_id>/sessions/<session_id>.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  PlayCircle,
  Wrench,
  AlertTriangle,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { ResumeSessionButton } from "@/components/shared/resume-session-button";
import { cn } from "@/lib/cn";
import type { ActivityEntry } from "@/lib/hooks/use-activity-unified";
import type { Employee } from "@/lib/types";
import type { ProjectRow } from "@/lib/hooks/use-projects";

type Group = { key: string; label: string; entries: ActivityEntry[] };

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(ts: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  const diff = (today - day) / (24 * 60 * 60 * 1000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(ts).getFullYear() === new Date(today).getFullYear()
        ? undefined
        : "numeric",
  });
}

function groupByDay(entries: ActivityEntry[]): Group[] {
  const out = new Map<number, Group>();
  for (const e of entries) {
    const day = startOfDay(e.ts);
    const existing = out.get(day);
    if (existing) existing.entries.push(e);
    else out.set(day, { key: String(day), label: dayLabel(e.ts), entries: [e] });
  }
  // Sort groups newest-first; within a group entries are already newest-first.
  return Array.from(out.values()).sort(
    (a, b) => Number(b.key) - Number(a.key),
  );
}

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

function absoluteTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function statusColor(status: ActivityEntry["status"]): string {
  if (status === "success") return "var(--status-online)";
  if (status === "running" || status === "active") return "var(--status-busy)";
  if (status === "error") return "var(--status-error)";
  if (status === "ended") return "var(--text-muted)";
  return "var(--status-idle)";
}

function iconFor(entry: ActivityEntry) {
  if (entry.kind === "run") {
    if (entry.type === "done") return CheckCircle2;
    if (entry.type === "error") return AlertTriangle;
    if (entry.type === "tool") return Wrench;
    if (entry.type === "message") return MessageSquare;
    return PlayCircle;
  }
  if (entry.type === "tool_use") return Wrench;
  if (entry.type === "error") return AlertTriangle;
  if (entry.type === "end") return CheckCircle2;
  if (entry.type === "start") return PlayCircle;
  return MessageSquare;
}

export function ActivityTimeline({
  entries,
  loading,
  employees,
  projects,
  onOpenRun,
}: {
  entries: ActivityEntry[];
  loading: boolean;
  employees: Employee[];
  projects: ProjectRow[];
  onOpenRun: (runId: string) => void;
}) {
  const router = useRouter();
  const [, setTick] = useState(0);
  // Re-render every 30s so relative times stay fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const groups = useMemo(() => groupByDay(entries), [entries]);

  const employeeById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);
  const projectById = useMemo(() => {
    const m = new Map<string, ProjectRow>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  if (loading && entries.length === 0) {
    return (
      <div className="card-surface flex items-center justify-center py-16 text-xs text-muted">
        <Loader2 className="mr-2 animate-spin" size={14} />
        Loading activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div className="text-sm font-semibold text-primary">
          No activity yet
        </div>
        <p className="max-w-sm text-xs text-secondary">
          When agents run or Claude Code sessions emit events, they’ll appear here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="sticky top-0 z-10 -mx-1 mb-2 bg-page/95 px-1 py-1 backdrop-blur">
            <div className="section-header">{g.label}</div>
          </div>
          <ul className="card-surface divide-y divide-subtle">
            {g.entries.map((e) => {
              const Icon = iconFor(e);
              const dotColor = statusColor(e.status);
              const employee =
                e.kind === "run" && e.employee_id
                  ? employeeById.get(e.employee_id) ?? null
                  : null;
              const project =
                e.kind === "session_event" && e.project_id
                  ? projectById.get(e.project_id) ?? null
                  : null;

              const onActivate = () => {
                if (e.kind === "run") onOpenRun(e.run_id);
                else
                  router.push(
                    `/projects/${encodeURIComponent(e.project_id)}/sessions/${encodeURIComponent(e.session_id)}`,
                  );
              };

              return (
                <li
                  key={e.id}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <div className="flex flex-col items-center pt-1">
                    <Icon
                      size={14}
                      className="text-muted"
                      aria-hidden
                    />
                    <span
                      className="mt-1 size-1.5 rounded-full"
                      style={{ background: dotColor }}
                      aria-label={e.status ?? "status"}
                    />
                  </div>
                  <button
                    onClick={onActivate}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    {e.kind === "run" ? (
                      <AgentAvatar
                        value={employee?.avatar ?? null}
                        name={employee?.name ?? "Run"}
                        size={28}
                        accent={employee?.accent ?? "#9CA3AF"}
                      />
                    ) : (
                      <AgentAvatar
                        value={project?.agent_avatar ?? null}
                        name={project?.name ?? "Session"}
                        size={28}
                        accent={project?.color ?? "#5B5BD6"}
                      />
                    )}
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-xs">
                        <span className="font-semibold text-primary">
                          {e.kind === "run"
                            ? employee?.name ?? "Run"
                            : project?.name ?? "Session"}
                        </span>{" "}
                        <span className="text-muted">·</span>{" "}
                        <span className="text-secondary">
                          {e.summary}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        <span
                          className="rounded-full px-1.5 py-0.5 font-semibold"
                          style={{
                            background:
                              e.kind === "run"
                                ? "var(--accent-primary-soft)"
                                : "var(--bg-surface-muted)",
                            color:
                              e.kind === "run"
                                ? "var(--accent-primary)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {e.kind === "run" ? "Run" : "Session"}
                        </span>
                        {e.cost && e.cost > 0 ? (
                          <span>${e.cost.toFixed(4)}</span>
                        ) : null}
                        {e.duration ? (
                          <span>{Math.round(e.duration / 1000)}s</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className="text-[10px] text-muted"
                      title={absoluteTime(e.ts)}
                    >
                      {relativeTime(e.ts)}
                    </span>
                    <div
                      className="flex items-center gap-1"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.kind === "session_event" ? (
                        <ResumeSessionButton
                          sessionId={e.session_id}
                          variant="icon"
                        />
                      ) : null}
                      <button
                        onClick={onActivate}
                        aria-label="Open detail"
                        className={cn(
                          "rounded-md p-1 text-muted opacity-0 transition group-hover:opacity-100",
                          "hover:bg-surface-hover hover:text-primary",
                        )}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
