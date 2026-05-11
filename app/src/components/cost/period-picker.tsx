"use client";
/**
 * PeriodPicker — segmented control for the /cost page.
 * Pure presentational: parent owns the active value via useCostStats.
 */
import { cn } from "@/lib/cn";
import type { CostPeriod } from "@/lib/hooks/use-cost-stats";

const OPTIONS: Array<{ value: CostPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

export function PeriodPicker({
  value,
  onChange,
}: {
  value: CostPeriod;
  onChange: (p: CostPeriod) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Cost period"
      className="inline-flex items-center gap-0.5 rounded-full border border-strong bg-white p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              active
                ? "bg-accent text-white"
                : "text-secondary hover:bg-surface-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
