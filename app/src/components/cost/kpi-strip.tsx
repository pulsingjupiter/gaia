"use client";
/**
 * CostKpiStrip — four KPI cards: total cost (with trend chip), total runs,
 * avg cost per run, success rate. Mirrors the visual language of
 * SprintKpiStrip but specialised for currency formatting.
 */
import type {
  CostStats,
  CostPeriod,
} from "@/lib/hooks/use-cost-stats";

function fmtCost(n: number): string {
  if (n >= 1000) return `$${n.toFixed(0)}`;
  if (n >= 100) return `$${n.toFixed(1)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtRate(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const PRIOR_LABEL: Record<CostPeriod, string> = {
  today: "vs yesterday",
  "7d": "vs prior 7d",
  "30d": "vs prior 30d",
  all: "",
};

export function CostKpiStrip({
  stats,
  period,
}: {
  stats: CostStats;
  period: CostPeriod;
}) {
  const totals = stats.totals;
  const finished = totals.success + totals.error;
  const successRate = finished > 0 ? totals.success / finished : 0;
  const avgCost = totals.runs > 0 ? totals.cost_usd / totals.runs : 0;
  const trend = stats.trend.vs_previous_period;
  const trendLabel = PRIOR_LABEL[period];

  // Color the trend chip — up=red (more spend), down=green (saving), flat=grey.
  // Show only when we have both a prior window and a meaningful delta.
  const showTrend = period !== "all" && trendLabel !== "";
  const trendArrow =
    trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  const trendColor =
    trend.direction === "up"
      ? "#EF4444"
      : trend.direction === "down"
        ? "#10B981"
        : "#9CA3AF";
  const trendText =
    trend.direction === "flat"
      ? "flat"
      : `${trendArrow} ${Math.abs(trend.delta_pct).toFixed(1)}%`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="card-surface p-3">
        <div className="section-header text-[10px]">Total Cost</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[22px] font-bold text-primary">
            {fmtCost(totals.cost_usd)}
          </span>
          {showTrend ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: `${trendColor}1A`,
                color: trendColor,
              }}
              title={`${trendText} ${trendLabel}`}
            >
              {trendText}
            </span>
          ) : null}
        </div>
        {showTrend ? (
          <div className="mt-0.5 text-[10px] text-muted">
            {trendLabel}
          </div>
        ) : null}
      </div>

      <div className="card-surface p-3">
        <div className="section-header text-[10px]">Total Runs</div>
        <div className="mt-1 text-[22px] font-bold text-primary">
          {totals.runs.toLocaleString()}
        </div>
        <div className="mt-0.5 text-[10px] text-muted">
          {totals.success} succeeded · {totals.error} failed
        </div>
      </div>

      <div className="card-surface p-3">
        <div className="section-header text-[10px]">Avg Cost / Run</div>
        <div className="mt-1 text-[22px] font-bold text-primary">
          {totals.runs > 0 ? fmtCost(avgCost) : "—"}
        </div>
        <div className="mt-0.5 text-[10px] text-muted">
          across {totals.runs.toLocaleString()} run{totals.runs === 1 ? "" : "s"}
        </div>
      </div>

      <div className="card-surface p-3">
        <div className="section-header text-[10px]">Success Rate</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[22px] font-bold text-primary">
            {finished > 0 ? fmtRate(successRate) : "—"}
          </span>
          {finished > 0 ? (
            <svg width="60" height="20" viewBox="0 0 60 20" className="ml-auto">
              <polyline
                points={`0,${20 - successRate * 16} 60,${20 - successRate * 16}`}
                fill="none"
                stroke="var(--status-online)"
                strokeWidth="1.5"
              />
            </svg>
          ) : null}
        </div>
        <div className="mt-0.5 text-[10px] text-muted">
          {finished} finished run{finished === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
