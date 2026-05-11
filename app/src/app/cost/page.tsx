"use client";
/**
 * /cost — aggregate spend across the workforce.
 *
 * Fetches /api/cost via useCostStats (30s poll), drives a four-card KPI
 * strip, a 30-day SVG bar chart, and two tables (by agent, by skill).
 * Period picker swaps the active window; the chart always shows 30 days
 * regardless so the trend stays comparable.
 */
import { PageHeader } from "@/components/shell/page-header";
import { useCostStats } from "@/lib/hooks/use-cost-stats";
import { CostKpiStrip } from "@/components/cost/kpi-strip";
import { DailyChart } from "@/components/cost/daily-chart";
import { ByAgentTable } from "@/components/cost/by-agent-table";
import { BySkillTable } from "@/components/cost/by-skill-table";
import { PeriodPicker } from "@/components/cost/period-picker";

export default function CostPage() {
  const { stats, loading, error, period, setPeriod } = useCostStats("7d");

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Cost"
        subtitle="What your AI workforce is spending."
        right={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      {error ? (
        <div className="mb-4 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      {!stats && loading ? (
        <CostSkeleton />
      ) : !stats ? (
        <div className="card-surface p-8 text-center text-sm text-secondary">
          No cost data available yet.
        </div>
      ) : (
        <div className="space-y-4">
          <CostKpiStrip stats={stats} period={period} />
          <DailyChart days={stats.by_day} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ByAgentTable rows={stats.by_agent} />
            <BySkillTable rows={stats.by_skill} />
          </div>
        </div>
      )}
    </div>
  );
}

function CostSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-surface animate-pulse p-3">
            <div className="h-3 w-20 rounded bg-surface-hover" />
            <div className="mt-2 h-6 w-24 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="card-surface h-[180px] animate-pulse p-4">
        <div className="h-3 w-32 rounded bg-surface-hover" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-surface h-[260px] animate-pulse p-4" />
        <div className="card-surface h-[260px] animate-pulse p-4" />
      </div>
    </div>
  );
}
