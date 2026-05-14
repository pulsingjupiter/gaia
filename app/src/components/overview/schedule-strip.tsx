"use client";
import Link from "next/link";
import { ChevronRight, Clock, Calendar } from "lucide-react";
import { useScheduledRuns } from "@/lib/hooks/use-scheduled-runs";
import { useEmployees } from "@/components/employees/employees-context";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { computeNextFire } from "@/components/schedule/upcoming-fires";

export function ScheduleStrip() {
  const { scheduledRuns, loading } = useScheduledRuns();
  const { employees } = useEmployees();
  const now = Date.now();

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const enabled = scheduledRuns.filter((r) => r.enabled === 1);

  const fires = enabled
    .map((run) => {
      const next = computeNextFire(run.schedule_cron, now);
      return {
        run,
        employee: run.employee_id
          ? employeeById.get(run.employee_id)
          : undefined,
        nextFire: next,
      };
    })
    .filter((f) => {
      if (!f.nextFire) return false;
      const d = new Date(f.nextFire);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);
      return f.nextFire <= tomorrow.getTime();
    })
    .sort((a, b) => (a.nextFire ?? 0) - (b.nextFire ?? 0));

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div className="section-header">Schedule</div>
        <Link
          href="/schedule"
          className="text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-surface-muted"
            />
          ))
        ) : fires.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted">
              No scheduled runs today —{" "}
              <Link href="/schedule" className="text-accent hover:underline">
                visit Schedule
              </Link>{" "}
              to set one up.
            </p>
          </div>
        ) : (
          fires.map(({ run, employee, nextFire }) => {
            const isToday =
              new Date(nextFire!).getDate() === new Date(now).getDate();
            const timeStr = new Date(nextFire!).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const hasRanToday =
              run.last_run_at &&
              new Date(run.last_run_at).getDate() === new Date(now).getDate();

            return (
              <div
                key={run.id}
                className="flex items-center gap-3 rounded-lg border border-subtle bg-white px-3 py-2"
              >
                {employee ? (
                  <AgentAvatar
                    value={employee.avatar}
                    name={employee.name}
                    size={24}
                    accent={employee.accent}
                  />
                ) : (
                  <div className="size-6 rounded-full bg-surface-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-primary">
                    {run.human_label || run.skill}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="truncate">{employee?.name}</span>
                    <span aria-hidden>•</span>
                    <span className="truncate">{run.schedule_cron}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    {hasRanToday && (
                      <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-600">
                        Ran
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-[11px] font-medium text-secondary">
                      <Clock size={12} className="text-muted" />
                      {isToday ? timeStr : `Tomorrow, ${timeStr}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
