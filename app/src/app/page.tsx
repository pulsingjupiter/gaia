"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { KPICard } from "@/components/overview/kpi-card";
import { TaskCard } from "@/components/overview/task-card";
import { WorkforcePanel } from "@/components/overview/workforce-panel";
import { ScheduleStrip } from "@/components/overview/schedule-strip";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { RecentSessions } from "@/components/overview/recent-sessions";
import { ConversationsList } from "@/components/overview/conversations-list";
import { QuickActions } from "@/components/overview/quick-actions";
import { ThermalWidget } from "@/components/overview/thermal-widget";
import { DueSummaryWidget } from "@/components/overview/due-summary-widget";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { useEmployees } from "@/components/employees/employees-context";
import { OVERVIEW_TASKS, type OverviewTask } from "@/lib/mock/tasks";
import { useTaskDueSummary } from "@/lib/hooks/use-task-due-summary";
import { useUnreadCount } from "@/lib/hooks/use-unread-count";

/** Time-of-day-aware greeting. Local clock, no name attached. */
function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Live human-readable date, e.g. "Monday, May 12". */
function formatToday(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Lightweight "completed today" counter. Hits the existing
 * `/api/runs?stats=1&from=<startOfToday>` endpoint — no new backend.
 * Returns null while loading or on failure so the KPI card can show "—"
 * rather than a fake number.
 */
function useCompletedTodayCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function refresh(): Promise<void> {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const qs = new URLSearchParams({
          stats: "1",
          from: start.toISOString(),
        });
        const res = await fetch(`/api/runs?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          stats?: { success?: number };
        };
        if (cancelled) return;
        setCount(
          typeof data.stats?.success === "number" ? data.stats.success : 0,
        );
      } catch {
        // swallow — keep last-known value (initially null)
      }
    }
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return count;
}

function pickEmployeeForTask(taskId: string, ids: string[]): string | null {
  // Stable round-robin assignment so each task card has a deterministic owner
  // until the backlog/scheduler is built. Hash the task id to an index.
  if (ids.length === 0) return null;
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return ids[h % ids.length];
}

export default function OverviewPage() {
  const { employees } = useEmployees();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Live, DB-backed numbers for the KPI strip. Each hook polls on its own
  // cadence; all three endpoints are cheap (single SQL counts). No more
  // hard-coded "12 / 28 / 24 / 7" placeholders.
  const { summary: taskSummary } = useTaskDueSummary(null);
  const { pendingApprovals } = useUnreadCount();
  const completedToday = useCompletedTodayCount();

  // Greeting + date are derived from the client's local clock after mount.
  // Computing them during render would run on the server too (Next.js
  // pre-renders this page), and the server's timezone / wall-clock may
  // differ from the user's — causing a React hydration mismatch warning.
  // Keep the server-rendered fallback static ("Welcome", empty date), then
  // upgrade in a useEffect once we're safely on the client.
  const [greeting, setGreeting] = useState<string>("Welcome");
  const [todayLabel, setTodayLabel] = useState<string>("");
  useEffect(() => {
    const now = new Date();
    setGreeting(greetingForHour(now.getHours()));
    setTodayLabel(formatToday(now));
  }, []);

  // Test instance: detect "skipped onboarding & still no agents" so we can
  // surface a friendly inline prompt at the top of the dashboard. Prod stays
  // unchanged — `testMode` never flips true.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/system/mode", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { test_mode?: boolean };
        if (!cancelled) setTestMode(Boolean(data.test_mode));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleAgents = employees.filter(
    (e) => e.id !== "system" && !e.internalOnly,
  );
  // Show the "Add your first agent" prompt whenever the roster is empty —
  // not just on the test instance. Fresh clones (which no longer seed demo
  // agents by default) land here on first paint.
  const showEmptyPrompt = visibleAgents.length === 0;

  const runTask = useCallback(
    async (task: OverviewTask) => {
      setRunError(null);
      const empId = pickEmployeeForTask(
        task.id,
        employees.map((e) => e.id),
      );
      if (!empId) {
        setRunError("No agents available — add one first.");
        return;
      }
      try {
        const input = [task.title, task.body].filter(Boolean).join(" — ");
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            employee_id: empId,
            skill: "adhoc",
            input,
          }),
        });
        if (!(res.status === 202 || res.status === 200)) {
          throw new Error(`POST /api/runs ${res.status}`);
        }
        const data = (await res.json()) as { run_id?: string };
        if (!data.run_id) throw new Error("No run_id returned");
        setActiveRunId(data.run_id);
        setDrawerOpen(true);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
      }
    },
    [employees],
  );

  return (
    <div className="px-6 py-6">
      <PageHeader
        title={
          <>
            {greeting} <span aria-hidden>👋</span>
          </>
        }
        subtitle="Here's what's happening with your AI workforce today."
        right={
          todayLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary">
              {todayLabel}
            </span>
          ) : null
        }
      />

      {showEmptyPrompt ? (
        <div className="card-surface mb-6 flex flex-col items-start gap-3 border-accent/30 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-primary">
              No agents yet
            </div>
            <p className="mt-0.5 text-xs text-secondary">
              Add your first agent to start exploring Gaia.
              {testMode ? " You can also re-run the setup wizard." : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {testMode ? (
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/80"
              >
                Re-run wizard
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus size={12} />
              Create your first
            </button>
          </div>
        </div>
      ) : null}

      {/* KPI strip — all four values are DB-backed. No fake numbers on a
          fresh clone: an empty workspace cleanly shows 0 / 0 / 0 / 0 until
          the user starts spinning up agents and runs. */}
      {(() => {
        const visibleCount = visibleAgents.length;
        const onlineCount = visibleAgents.filter(
          (e) => e.status === "Online",
        ).length;
        const inProgress = taskSummary.in_progress;
        const totalOpen = taskSummary.total;
        const completedLabel =
          completedToday === null ? "—" : String(completedToday);
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              label="Active Agents"
              value={String(visibleCount)}
              secondary={
                visibleCount > 0 ? `/ ${visibleCount} online` : undefined
              }
              footer={
                visibleCount === 0
                  ? "No agents yet — add one to get started"
                  : `${onlineCount} idle, ready`
              }
              icon={Users}
              iconBg="#EEEAFD"
              iconFg="#5B5BD6"
            />
            <KPICard
              label="Tasks Running"
              value={String(inProgress)}
              secondary={totalOpen > 0 ? `/ ${totalOpen}` : undefined}
              footer={
                totalOpen === 0
                  ? "No open tasks"
                  : `${Math.round(((totalOpen - inProgress) / totalOpen) * 100)}% not yet started`
              }
              icon={ClipboardList}
              iconBg="#D1FAE5"
              iconFg="#059669"
            />
            <KPICard
              label="Completed Today"
              value={completedLabel}
              footer={
                completedToday === null
                  ? "Loading…"
                  : completedToday === 0
                    ? "No runs completed yet today"
                    : "Successful runs since midnight"
              }
              icon={CheckCircle2}
              iconBg="#FCE7F3"
              iconFg="#DB2777"
            />
            <KPICard
              label="Pending Approvals"
              value={String(pendingApprovals)}
              footer={
                pendingApprovals === 0
                  ? "Nothing waiting on you"
                  : "Requires your review"
              }
              icon={Clock}
              iconBg="#FFE4D6"
              iconFg="#C2410C"
            />
          </div>
        );
      })()}

      {runError ? (
        <div className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
          {runError}
        </div>
      ) : null}

      {/* Two-column row */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="card-surface p-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <div className="section-header">Tasks</div>
            <Link
              href="/tasks"
              className="text-[11px] font-medium text-accent hover:underline"
            >
              View all tasks →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OVERVIEW_TASKS.map((t) => (
              <TaskCard key={t.id} task={t} onRun={runTask} />
            ))}
          </div>
        </section>
        <section className="lg:col-span-4">
          <WorkforcePanel />
        </section>
      </div>

      {/* Schedule strip + right rail */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ScheduleStrip />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <DueSummaryWidget />
          <ThermalWidget />
          <ActivityFeed />
          <RecentSessions />
          <ConversationsList />
          <QuickActions />
        </div>
      </div>

      <LiveRunDrawer
        runId={activeRunId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <EmployeeModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
