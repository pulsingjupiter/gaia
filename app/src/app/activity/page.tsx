"use client";
/**
 * Activity — unified observability stream.
 *
 * Two sources merged in real time:
 *   • Agent runs (in-Gaia invocations)
 *   • Claude Code session events (external transcripts)
 *
 * Layout: page header → KPI strip → filter bar → timeline. The right-side
 * LiveRunDrawer is mounted once and shown when a run row is clicked.
 */
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ActivityKpiStrip } from "@/components/activity/activity-kpi-strip";
import { ActivityFilterBar } from "@/components/activity/activity-filter-bar";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { useActivityUnified } from "@/lib/hooks/use-activity-unified";
import { useProjects } from "@/lib/hooks/use-projects";
import { useEmployees } from "@/components/employees/employees-context";

type SessionRow = { id: string; status: "active" | "idle" | "ended" };

function useActiveSessionCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sessions?status=active&limit=200", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { sessions?: SessionRow[] };
        if (cancelled) return;
        setCount((data.sessions ?? []).length);
      } catch {
        // ignore
      }
    }
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return count;
}

export default function ActivityPage() {
  const { entries, loading, filters, setFilters } = useActivityUnified();
  const { projects } = useProjects();
  const { employees } = useEmployees();
  const activeNow = useActiveSessionCount();

  const [openRunId, setOpenRunId] = useState<string | null>(null);

  // Memoize counts so subtitle / chip text is stable.
  const counts = useMemo(() => {
    let runs = 0;
    let sessions = 0;
    for (const e of entries) {
      if (e.kind === "run") runs++;
      else sessions++;
    }
    return { runs, sessions };
  }, [entries]);

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Activity"
        subtitle="All agent runs and Claude Code sessions in one timeline."
        right={
          <div className="text-xs text-muted">
            Showing {entries.length} event{entries.length === 1 ? "" : "s"} ·{" "}
            <span className="text-secondary">
              {counts.runs} run{counts.runs === 1 ? "" : "s"}
            </span>{" "}
            ·{" "}
            <span className="text-secondary">
              {counts.sessions} session
              {counts.sessions === 1 ? "" : "s"}
            </span>
          </div>
        }
      />

      <ActivityKpiStrip activeNow={activeNow} />

      <div className="mt-6 mb-3">
        <ActivityFilterBar
          filters={filters}
          setFilters={setFilters}
          projects={projects}
          employees={employees}
        />
      </div>

      <ActivityTimeline
        entries={entries}
        loading={loading}
        employees={employees}
        projects={projects}
        onOpenRun={setOpenRunId}
      />

      <LiveRunDrawer
        runId={openRunId}
        open={!!openRunId}
        onClose={() => setOpenRunId(null)}
      />
    </div>
  );
}
