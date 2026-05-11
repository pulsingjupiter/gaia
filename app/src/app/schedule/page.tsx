"use client";
/**
 * /schedule — single-purpose surface for cron-fired autonomous runs.
 *
 * Two stacked sections, both fed from the live `scheduled_runs` table:
 *   1. Scheduled Tasks  — full management table (toggle / edit / delete).
 *   2. Upcoming Fires    — next-24h chronological preview of when each
 *                          enabled task will fire next.
 *
 * The week-grid + right-rail mock surfaces were retired with the wave that
 * promoted Schedule into a real autonomy console; their files have been
 * deleted. The overview page still renders a small mock strip from
 * `mock/schedule.ts` so we leave that data file alone.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { CronTaskRow } from "@/components/schedule/cron-task-row";
import { AddCronTaskModal } from "@/components/schedule/add-cron-task-modal";
import { UpcomingFires } from "@/components/schedule/upcoming-fires";
import { MorningBriefingCta } from "@/components/schedule/morning-briefing-cta";
import {
  useScheduledRuns,
  type ScheduledRunRow,
} from "@/lib/hooks/use-scheduled-runs";
import { useEmployees } from "@/components/employees/employees-context";
import { useProjects } from "@/lib/hooks/use-projects";

export default function SchedulePage() {
  const { scheduledRuns, loading, toggle, add, update, remove, refresh } =
    useScheduledRuns();
  const { employees } = useEmployees();
  const { projects } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<ScheduledRunRow | null>(null);

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const closeModal = () => {
    setModalOpen(false);
    setEditingRun(null);
  };

  const openCreate = () => {
    setEditingRun(null);
    setModalOpen(true);
  };

  const openEdit = (run: ScheduledRunRow) => {
    setEditingRun(run);
    setModalOpen(true);
  };

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Schedule"
        subtitle="Cron-fired tasks running autonomously."
        right={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus size={14} />
            New Schedule
          </button>
        }
      />

      {/* MORNING BRIEFING — autonomy demo CTA, hides itself once all 5 exist */}
      <MorningBriefingCta
        taskIds={scheduledRuns.map((t) => t.id)}
        onCreated={refresh}
      />

      {/* SCHEDULED TASKS — live cron management */}
      <section className="mb-6">
        <div className="mb-2 flex items-end justify-between">
          <div className="section-header">Scheduled Tasks</div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
          >
            <Plus size={12} />
            New Scheduled Task
          </button>
        </div>
        <div className="card-surface overflow-hidden">
          {loading && scheduledRuns.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted">
              Loading scheduled tasks…
            </div>
          ) : scheduledRuns.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-sm font-medium text-primary">
                No scheduled tasks
              </div>
              <div className="mt-1 text-xs text-muted">
                Add one to let agents work autonomously.
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                <Plus size={12} />
                New Scheduled Task
              </button>
            </div>
          ) : (
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted">
                  <th className="w-12 py-2 pl-3 pr-2 font-semibold">On</th>
                  <th className="py-2 pr-3 font-semibold">Task</th>
                  <th className="w-44 py-2 pr-3 font-semibold">Agent</th>
                  <th className="w-32 py-2 pr-3 font-semibold">Skill</th>
                  <th className="w-40 py-2 pr-3 font-semibold">Schedule</th>
                  <th className="w-28 py-2 pr-3 font-semibold">Last Run</th>
                  <th className="w-20 py-2 pr-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scheduledRuns.map((run) => (
                  <CronTaskRow
                    key={run.id}
                    run={run}
                    employee={
                      run.employee_id
                        ? employeeById.get(run.employee_id)
                        : undefined
                    }
                    onToggle={(id, enabled) => {
                      void toggle(id, enabled);
                    }}
                    onEdit={openEdit}
                    onDelete={(id) => {
                      void remove(id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* UPCOMING FIRES — chronological preview, next 24h */}
      <section>
        <div className="mb-2 flex items-end justify-between">
          <div className="section-header">Upcoming fires (next 24h)</div>
        </div>
        <UpcomingFires runs={scheduledRuns} />
      </section>

      <AddCronTaskModal
        open={modalOpen}
        employees={employees}
        projects={projects}
        editingRun={editingRun}
        onClose={closeModal}
        onCreate={add}
        onUpdate={update}
      />
    </div>
  );
}
