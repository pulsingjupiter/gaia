"use client";
/**
 * WorkloadTab — single-column stack of 5 status cards on the agent detail
 * page. Surfaces "what is this agent currently involved with":
 *
 *   1. NOW                — running runs (or last activity)
 *   2. SCHEDULED          — enabled cron tasks owned by this agent
 *   3. BACKLOG            — backlog tasks assigned here
 *   4. PENDING APPROVALS  — approvals awaiting Adrian's decision
 *   5. CONVERSATIONS      — user↔agent threads active in the last 7 days
 *
 * All cards share the same shell — uppercase title + count chip + body — and
 * reuse existing primitives (`<AgentAvatar>`, `<LiveRunDrawer>`,
 * `<ApprovalCard>`, the cron parser). No new APIs.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquare,
} from "lucide-react";

import { AgentAvatar } from "@/components/shared/agent-avatar";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { ApprovalCard } from "@/components/conversations/approval-card";
import { useEmployees } from "@/components/employees/employees-context";
import { useApprovals } from "@/lib/hooks/use-approvals";
import { useAgentWorkload } from "@/lib/hooks/use-agent-workload";
import {
  computeNextFire,
} from "@/components/schedule/upcoming-fires";
import { describeSchedule } from "@/components/schedule/cron-task-row";
import type { EmployeeRow } from "@/lib/hooks/use-employees";
import { cn } from "@/lib/cn";

const PRIORITY_PILL: Record<"high" | "medium" | "low", string> = {
  high: "bg-red-50 text-red-700 border-red-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export function WorkloadTab({ employee }: { employee: EmployeeRow }) {
  const workload = useAgentWorkload(employee.id);
  const router = useRouter();
  const { employees } = useEmployees();
  const [drawerRunId, setDrawerRunId] = useState<string | null>(null);

  // Approvals: use the canonical hook so Approve/Skip stay optimistic and
  // round-trip through the same code path the inbox uses. We pass the
  // server-filtered list down to <ApprovalCard> via this hook's `approve`/
  // `skip`. After resolving we also kick off a workload refresh so the count
  // chip updates immediately.
  const approvalsApi = useApprovals({ status: "pending", agent_id: employee.id });

  const employeeForApprovals = employees.find((e) => e.id === employee.id) ?? null;

  const handleApprove = async (id: string) => {
    await approvalsApi.approve(id);
    void workload.refresh();
  };
  const handleSkip = async (id: string) => {
    await approvalsApi.skip(id);
    void workload.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Card 1 — NOW */}
      <Card
        title="Now"
        icon={Loader2}
        count={workload.activeRuns.length}
        countTone={workload.activeRuns.length > 0 ? "live" : "muted"}
      >
        {workload.activeRuns.length > 0 ? (
          <ul className="divide-y divide-subtle">
            {workload.activeRuns.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <Loader2
                  size={14}
                  className="shrink-0 animate-spin text-amber-600"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-semibold text-primary">
                    {r.skill}
                  </div>
                  <div className="text-[10.5px] text-muted">
                    started {relativeTime(r.started_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerRunId(r.id)}
                  className="rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-semibold text-secondary hover:bg-surface-muted"
                >
                  View live
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-4 text-xs text-muted">
            {workload.recentLastActivity === null
              ? "Hasn't run yet."
              : `Idle. Last activity ${relativeTime(workload.recentLastActivity)}.`}
          </div>
        )}
      </Card>

      {/* Card 2 — SCHEDULED */}
      <Card
        title="Scheduled"
        icon={CalendarClock}
        count={workload.scheduled.length}
      >
        {workload.scheduled.length > 0 ? (
          <ul className="divide-y divide-subtle">
            {workload.scheduled.map((task) => {
              const next = task.schedule_cron
                ? computeNextFire(task.schedule_cron, Date.now())
                : null;
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs"
                >
                  <AgentAvatar
                    value={employee.avatar_emoji}
                    name={employee.name}
                    size={24}
                    accent={employee.accent_color ?? "#6366F1"}
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate font-semibold text-primary">
                      {task.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
                      <span>{describeSchedule(task)}</span>
                      {task.skill ? (
                        <>
                          <span aria-hidden>•</span>
                          <span className="rounded bg-surface-muted px-1 py-0.5 font-mono">
                            {task.skill}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-secondary">
                    {next ? `fires ${formatDelta(next - Date.now())}` : "Custom"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Nothing scheduled.</Empty>
        )}
      </Card>

      {/* Card 3 — BACKLOG */}
      <Card title="Backlog" icon={Inbox} count={workload.backlog.length}>
        {workload.backlog.length > 0 ? (
          <ul className="divide-y divide-subtle">
            {workload.backlog.map((task) => {
              const onClick = () => {
                if (task.project_id) {
                  router.push(`/projects/${encodeURIComponent(task.project_id)}`);
                }
              };
              const clickable = !!task.project_id;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "px-4 py-2.5 text-xs",
                    clickable &&
                      "cursor-pointer transition hover:bg-surface-muted",
                  )}
                  onClick={clickable ? onClick : undefined}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold text-primary">
                          {task.title}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                            PRIORITY_PILL[task.priority],
                          )}
                        >
                          {task.priority}
                        </span>
                        {task.project_id ? (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono text-muted">
                            {task.project_id}
                          </span>
                        ) : null}
                      </div>
                      {task.description ? (
                        <div className="mt-1 line-clamp-2 text-[11.5px] text-secondary">
                          {task.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No backlog tasks assigned.</Empty>
        )}
      </Card>

      {/* Card 4 — PENDING APPROVALS */}
      <Card
        title="Pending Approvals"
        icon={CheckCircle2}
        count={approvalsApi.approvals.length}
        countTone={approvalsApi.approvals.length > 0 ? "warn" : "muted"}
      >
        {approvalsApi.approvals.length > 0 ? (
          <div className="space-y-0 px-3 pt-3 pb-1">
            {approvalsApi.approvals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                agent={employeeForApprovals}
                onApprove={handleApprove}
                onSkip={handleSkip}
              />
            ))}
          </div>
        ) : (
          <Empty>No approvals pending.</Empty>
        )}
      </Card>

      {/* Card 5 — CONVERSATIONS */}
      <Card
        title="Conversations"
        icon={MessageSquare}
        count={workload.activeThreads.length}
      >
        {workload.activeThreads.length > 0 ? (
          <ul className="divide-y divide-subtle">
            {workload.activeThreads.map((t) => (
              <li
                key={t.thread_id}
                onClick={() => router.push("/conversations")}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-xs transition hover:bg-surface-muted"
              >
                <AgentAvatar
                  value={employee.avatar_emoji}
                  name={employee.name}
                  size={24}
                  accent={employee.accent_color ?? "#6366F1"}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-secondary">
                    {t.last_message || "(no messages)"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                    <span>{relativeTime(t.last_at)}</span>
                    {t.unread_count > 0 ? (
                      <>
                        <span aria-hidden>•</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-accent">
                          <Bell size={10} />
                          {t.unread_count} unread
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No active conversations in the last 7 days.</Empty>
        )}
      </Card>

      <LiveRunDrawer
        runId={drawerRunId}
        open={drawerRunId !== null}
        onClose={() => setDrawerRunId(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card shell + small helpers
// ---------------------------------------------------------------------------

function Card({
  title,
  icon: Icon,
  count,
  countTone = "default",
  children,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  countTone?: "default" | "muted" | "warn" | "live";
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-muted/40 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-muted" />
          <span className="section-header">{title}</span>
        </div>
        <span
          className={cn(
            "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            countTone === "warn"
              ? "bg-amber-100 text-amber-700"
              : countTone === "live"
                ? "bg-emerald-100 text-emerald-700"
                : countTone === "muted" || count === 0
                  ? "bg-surface-muted text-muted"
                  : "bg-accent/10 text-accent",
          )}
        >
          {count}
        </span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 text-xs text-muted">{children}</div>
  );
}

function relativeTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  if (diff < 60_000) {
    const s = Math.max(1, Math.round(diff / 1000));
    return `${s}s ago`;
  }
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDelta(ms: number): string {
  if (ms <= 0) return "now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min - hr * 60;
  if (hr < 24) {
    if (remMin === 0) return `in ${hr}h`;
    return `in ${hr}h ${remMin}m`;
  }
  const days = Math.floor(hr / 24);
  return `in ${days}d`;
}
