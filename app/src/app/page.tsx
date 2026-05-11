"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
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
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { useEmployees } from "@/components/employees/employees-context";
import { OVERVIEW_TASKS, type OverviewTask } from "@/lib/mock/tasks";

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
  const showEmptyPrompt = testMode && visibleAgents.length === 0;

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
            Good morning, Professor <span aria-hidden>👋</span>
          </>
        }
        subtitle="Here's what's happening with your AI workforce today."
        right={
          <button className="inline-flex items-center gap-1.5 rounded-full border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary">
            May 24, 2024
            <ChevronDown size={12} />
          </button>
        }
      />

      {showEmptyPrompt ? (
        <div className="card-surface mb-6 flex flex-col items-start gap-3 border-accent/30 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-primary">
              No agents yet
            </div>
            <p className="mt-0.5 text-xs text-secondary">
              You&apos;re running the test instance. Add your first agent to
              start exploring.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/80"
            >
              Re-run wizard
            </Link>
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

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Active Agents"
          value={String(employees.length)}
          secondary={`/ ${employees.length} online`}
          footer={`${employees.filter((e) => e.status === "Online").length} idle, ready`}
          icon={Users}
          iconBg="#EEEAFD"
          iconFg="#5B5BD6"
        />
        <KPICard
          label="Tasks Running"
          value="12"
          secondary="/ 28"
          footer="42% completed"
          icon={ClipboardList}
          iconBg="#D1FAE5"
          iconFg="#059669"
        />
        <KPICard
          label="Completed Today"
          value="24"
          footer="18% vs yesterday"
          icon={CheckCircle2}
          iconBg="#FCE7F3"
          iconFg="#DB2777"
        />
        <KPICard
          label="Pending Approvals"
          value="7"
          footer="Requires your review"
          icon={Clock}
          iconBg="#FFE4D6"
          iconFg="#C2410C"
        />
      </div>

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
              href="/sprint"
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
